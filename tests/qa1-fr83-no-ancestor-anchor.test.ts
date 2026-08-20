// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * FR-83, checked at the one place the component cannot check itself.
 *
 * Written by `qa-reviewer` (work-unit `qa1`, run `eb2490`) as an independent
 * review artefact, not by the unit that built `<EntityRef>`.
 *
 * ## The gap this closes
 *
 * FR-83: a reference that resolves to nothing "renders in FR-12's
 * dangling-reference treatment and **is never a link**."
 *
 * `src/components/entity-ref.tsx` honours that for the anchor it *creates* — the
 * dangling branch returns the bare span with no `<Link>` around it, and
 * `tests/entity-ref.test.tsx` asserts exactly that. But `closest("a")` walks the
 * whole ancestry, not just the part one component authored. An `<EntityRef>`
 * placed anywhere inside an enclosing `<Link>` — a linked table row, a card
 * wrapped in navigation — puts a dangling reference inside an anchor while every
 * existing test stays green, because each of those tests renders the component
 * in isolation.
 *
 * That is a whole-tree property. No component test can see it and no unit that
 * owns one screen can check it for the others, so it is checked here across
 * every source file at once.
 *
 * ## Why static rather than rendered
 *
 * Rendering all eight detail views plus the nine adopted screens needs a
 * database, and this repository's review runs hold no credential. A source scan
 * is decidable without one and runs in CI forever. It is deliberately
 * conservative: it looks for `<EntityRef` / `<EntityRefList` lexically inside a
 * `<Link>...</Link>` element in the same file, which is how every real instance
 * of this mistake would be written. A reference passed through an intermediate
 * component and linked by its *caller* would slip past, so this is a floor and
 * not a proof — stated here rather than implied.
 *
 * ## It fails closed
 *
 * If the scan matches no files at all, that is a broken scan and not a clean
 * repository, so the test asserts a non-zero census first. A check that silently
 * passes on nothing is the defect class this whole review exists to catch.
 */

const SRC = join(import.meta.dirname, "..", "src");

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
    } else if ([".ts", ".tsx"].includes(extname(entry.name))) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Every `<Link ...>...</Link>` region in `text`, as `[start, end)` offsets over
 * the element's children. Nesting-aware: a `<Link>` inside a `<Link>` does not
 * end the outer one early.
 */
function linkRegions(text: string): [number, number][] {
  const regions: [number, number][] = [];
  const open = /<Link[\s>]/g;
  let match: RegExpExecArray | null;

  while ((match = open.exec(text)) !== null) {
    // Skip to the end of the opening tag, so attributes are not scanned.
    const tagEnd = text.indexOf(">", match.index);
    if (tagEnd === -1) continue;
    // A self-closing `<Link />` has no children and cannot contain anything.
    if (text[tagEnd - 1] === "/") continue;

    let depth = 1;
    let cursor = tagEnd + 1;
    const start = cursor;
    while (depth > 0 && cursor < text.length) {
      const nextOpen = text.indexOf("<Link", cursor);
      const nextClose = text.indexOf("</Link>", cursor);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth += 1;
        cursor = nextOpen + 5;
      } else {
        depth -= 1;
        if (depth === 0) regions.push([start, nextClose]);
        cursor = nextClose + 7;
      }
    }
  }
  return regions;
}

const REF_TAG = /<EntityRef(List)?[\s>/]/;

function offences(text: string): string[] {
  return linkRegions(text)
    .map(([start, end]) => text.slice(start, end))
    .filter((inner) => REF_TAG.test(inner))
    .map((inner) => inner.replace(/\s+/g, " ").trim().slice(0, 120));
}

describe("FR-83 — a dangling reference is never inside an anchor, anywhere in the tree", () => {
  const files = sourceFiles(SRC);

  it("scans a non-empty set of source files (guards against a blind pass)", () => {
    expect(files.length).toBeGreaterThan(50);
    const withRefs = files.filter((file) =>
      REF_TAG.test(readFileSync(file, "utf8")),
    );
    // If this ever goes to zero the scan has stopped seeing the components it
    // is meant to police, and every assertion below would pass vacuously.
    expect(withRefs.length).toBeGreaterThan(0);
  });

  it("renders no <EntityRef> inside an enclosing <Link>", () => {
    const found: string[] = [];
    for (const file of files) {
      for (const snippet of offences(readFileSync(file, "utf8"))) {
        found.push(`${relative(SRC, file)} :: ${snippet}`);
      }
    }
    expect(found).toEqual([]);
  });

  it("control: the scan detects the offence when it is present", () => {
    // A positive control, because a scan that has never been seen to fail is
    // indistinguishable from one that cannot. This is the shape the real
    // mistake takes: a row wrapped in navigation, with a reference inside it.
    const offending = `
      <Link href={href} className="row">
        <span>{label}</span>
        <EntityRef kind="requirement" label={ref} id={id} />
      </Link>
    `;
    expect(offences(offending)).toHaveLength(1);

    // And the negative control: the shape the repository actually uses, where
    // the anchor is created by <EntityRef> itself and is not an ancestor.
    const fine = `
      <Link href="/registry/acme">{slug}</Link>
      <EntityRef kind="requirement" label={ref} id={id} />
    `;
    expect(offences(fine)).toEqual([]);
  });
});
