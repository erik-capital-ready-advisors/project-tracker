// @vitest-environment node
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * **M2.7's acceptance gate, written before M2.7 is dispatched. It is RED on
 * purpose and it is excluded from `pnpm test` until the milestone starts.**
 * Run it with `pnpm gate:m27`; delete the exclusion in `vitest.config.ts` on
 * the day the work begins.
 *
 * ## Why this exists at all
 *
 * Run `b0952e` had 966 tests, typecheck, lint, build, a report gate and an
 * independent QA pass, and it shipped a critical defect: `POST /api/ingest/run`
 * returned 500 on every request, so Mode-1 ingest — the reason this product
 * exists — was completely dead while the whole suite stayed green. Everything
 * the fleet reported was true and none of it was the thing that mattered.
 *
 * The lesson is not "distrust the fleet". It is that **a specialist's report is
 * only worth what an independent check can falsify**, and eight detail views
 * dispatched with no gate produce eight claims that only a person clicking
 * through populated screens on a Wednesday evening can disprove — which is how
 * the last four defects on this project were actually found.
 *
 * So this is written first, and it goes red first.
 *
 * ## What it can and cannot assert
 *
 * This half runs with **no credential and no network**, which is what lets it
 * live in CI forever after M2.7 ships. It therefore asserts only what is
 * decidable from the repository: that the routes FR-81 names exist, and that
 * there is ONE place deciding where an entity reference points.
 *
 * **The prescriptive part, stated rather than smuggled in.** Asserting a module
 * path dictates a little of the implementation, and a gate that dictates nothing
 * cannot check anything. The single seam is the point: FR-83 says a reference
 * resolving to nothing must render as dangling and *never* as a link, and that
 * is a rule which has to hold in eight views written by however many units. One
 * source of truth for "where does this reference point" is what makes it a rule
 * rather than eight independent good intentions.
 *
 * Everything about actual behaviour — that a link resolves, that a dangling ref
 * is not an anchor, that filter state survives a round trip — needs rows and a
 * session, and lives in `e2e/m27-navigation.spec.ts`.
 */

const SRC = join(import.meta.dirname, "..", "src");

/** CR-003 FR-81, verbatim: the eight entities that must have a detail view. */
const FR81_ENTITIES = [
  "work_item",
  "defect",
  "blocker",
  "requirement",
  "open_question",
  "external_wait",
  "release",
  "contract_milestone",
] as const;

interface EntityRoutes {
  ENTITY_KINDS: readonly string[];
  entityHref: (kind: string, id: string) => string | null;
  /** FR-86 — which kinds an agent token may never reach. See the test below. */
  OPERATOR_ONLY_KINDS: readonly string[];
}

/**
 * Loaded by absolute file URL rather than by the `@/` alias, and deliberately.
 * A static `import("@/lib/entity-routes")` of a module that does not exist yet
 * makes `pnpm typecheck` fail — so a gate for unbuilt work would break the
 * type-check gate for every other piece of work in the repository, and the first
 * person to hit it would delete the gate rather than build the milestone.
 */
async function entityRoutes(): Promise<EntityRoutes> {
  const path = join(SRC, "lib", "entity-routes.ts");
  if (!existsSync(path)) {
    throw new Error(
      "src/lib/entity-routes.ts does not exist. FR-80 requires every entity " +
        "reference on every screen to be navigable, and FR-83 requires a reference " +
        "that resolves to nothing to render as dangling and never as a link. Both " +
        "are rules that must hold across eight detail views; they need one place " +
        "that decides where a reference points.",
    );
  }
  return (await import(pathToFileURL(path).href)) as EntityRoutes;
}

/** Every route segment the App Router actually serves, as `/a/b` paths. */
function routeSegments(dir: string, prefix = ""): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_") || entry.name === "api") continue;
    const here = `${prefix}/${entry.name}`;
    const full = join(dir, entry.name);
    if (existsSync(join(full, "page.tsx"))) found.push(here);
    found.push(...routeSegments(full, here));
  }
  return found;
}

describe("FR-81 — eight entities, eight detail views", () => {
  it("declares a closed set of entity kinds covering exactly FR-81's eight", async () => {
    const { ENTITY_KINDS } = await entityRoutes();
    expect([...ENTITY_KINDS].sort()).toEqual([...FR81_ENTITIES].sort());
  });

  it("serves a real route for every one of them", async () => {
    const { ENTITY_KINDS, entityHref } = await entityRoutes();
    const routes = routeSegments(join(SRC, "app"));

    const unserved = ENTITY_KINDS.filter((kind) => {
      const href = entityHref(kind, "any-id");
      if (href === null) return true;
      // A detail route is dynamic, so match the static prefix against a route
      // whose last segment is a parameter.
      return !routes.some((route) => {
        const pattern = route.replace(/\/\[[^\]]+\]/g, "");
        return pattern !== "" && href.startsWith(pattern) && route.includes("[");
      });
    });

    expect(unserved).toEqual([]);
  });
});

describe("FR-83 — a reference to nothing is never a link", () => {
  it("refuses to build an href for a reference that resolves to nothing", async () => {
    const { entityHref } = await entityRoutes();

    // `null`, not a search page and not a 404 route. FR-83: "It is not a 404,
    // not a search, and not silently plain text." A model that always returns a
    // string cannot express the dangling case, and a caller handed one will
    // render a link to it — which is the exact weakening FR-83 forbids.
    expect(entityHref("requirement", "")).toBeNull();
  });

  it("refuses a kind it does not recognise rather than guessing a route", async () => {
    const { entityHref } = await entityRoutes();
    expect(entityHref("not_an_entity", "x")).toBeNull();
  });
});

describe("FR-86 — detail views add no decryption surface an agent token can reach", () => {
  it("carries §7a's operator-only rule in the same model that decides the routes", async () => {
    const { OPERATOR_ONLY_KINDS } = await entityRoutes();
    const { AGENT_FORBIDDEN_TABLES } = await import("@/lib/api/capabilities");

    // FR-86 keeps §7a's per-role rules unchanged, and `contract_milestone` is
    // the one FR-5 names outright: agents are refused it entirely, which is why
    // `/api/answer/committed` already answers them `403 forbidden_table`.
    //
    // The rule has to live HERE, beside the routes, rather than being
    // remembered in eight views. `AGENT_FORBIDDEN_TABLES` is the existing single
    // source of that fact; this asserts the route model agrees with it rather
    // than keeping a second copy that can drift.
    const forbiddenEntities = AGENT_FORBIDDEN_TABLES.filter((table) =>
      (FR81_ENTITIES as readonly string[]).includes(table),
    );

    expect(forbiddenEntities).toContain("contract_milestone");
    for (const table of forbiddenEntities) {
      expect(
        OPERATOR_ONLY_KINDS,
        `${table} is refused to agent tokens by §7a and the route model does not say so`,
      ).toContain(table);
    }
  });
});
