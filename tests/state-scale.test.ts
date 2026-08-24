// @vitest-environment node
import { globSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ALL_WORK_STATES, STATE_TREATMENT } from "@/components/state-badge";

/**
 * The semantic state scale must survive greyscale.
 *
 * ## Why this test exists
 *
 * Spec 5a's recorded direction (B11) makes a falsifiable claim: hue carries the
 * state FAMILY and fill/outline/dashed carries CONFIDENCE, "so FR-43's four
 * evidence scopes stay distinguishable in greyscale and to a colour-blind
 * reader". Nothing checked it, and on 2026-08-20 a review of the first populated
 * screens found it false in both themes:
 *
 *   * `observed-live` (#047857) and `observed-elsewhere` (#0f766e) are two of
 *     FR-43's four scopes, are both SOLID, and sat 2.6 apart in luminance out of
 *     255. In greyscale they are the same chip.
 *   * `state-unparsed` and `--primary` sat 0.3 apart in light and 0.9 in dark.
 *     Desaturated, the `unparsed` chip and the primary action button are the
 *     same value - which is precisely what B11's "violet appears nowhere in the
 *     state scale and fuchsia nowhere in the chrome" was written to prevent.
 *
 * A colour choice is not a matter of taste once the design has written down what
 * it must achieve. This asserts the written claim.
 *
 * ## What counts as a collision
 *
 * Only tokens that can appear in the SAME column. Reuse of a hue ACROSS scales
 * is deliberate - `verified` and `observed-live` share emerald because "good"
 * means the same thing in both - and those two never render side by side.
 *
 * Within one scale, two tokens are distinguishable if EITHER their treatment
 * differs (solid vs outline vs dashed survives greyscale by construction) OR
 * their luminance differs by at least MIN_GAP.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");

/** Luminance gap, out of 255, that stays visible at chip size once desaturated. */
const MIN_GAP = 12;
/** WCAG AA for normal text. Chips carry text at their own colour. */
const MIN_CONTRAST = 4.5;

/** Tokens that can share a column, and therefore must be told apart. */
const SCALES: Record<string, string[]> = {
  "work-item status": ["verified", "carried", "blocked", "decided-against", "unparsed"],
  "defect status": ["open", "fixed", "wont-fix", "closed", "contested"],
  "evidence scope": ["observed-live", "observed-elsewhere", "asserted", "not-verified"],
  coverage: ["unproven", "uncovered"],
};

/**
 * The second axis, read off the component rather than copied.
 *
 * A copy would drift: someone changes a treatment in `state-badge.tsx`, this
 * file keeps asserting the old one, and the test goes on passing while the claim
 * it defends has quietly stopped being true. Keyed by CSS-variable suffix, which
 * is how `SCALES` above names things.
 */
const TREATMENT: Record<string, string> = Object.fromEntries(
  ALL_WORK_STATES.map((state) => [state.replace(/_/g, "-"), STATE_TREATMENT[state]]),
);

/**
 * Pairs that still collide, each with the reason it is tolerated and the
 * condition that removes it.
 *
 * `unparsed` is boxed in: inside the work-item scale it must clear `verified`,
 * `carried` and `blocked`, and as a filled pill it must also clear `--primary`.
 * That is four constraints in a band the contrast floor already narrows, and an
 * automated solve for it produced a value that collided with `verified` instead.
 * The agreed fix is therefore a TREATMENT unique to `unparsed` - a fill no other
 * token uses - which removes it from the luminance problem entirely.
 *
 * That treatment shipped on 2026-08-20, so this list is now EMPTY. It is still
 * asserted exactly, so a new collision cannot be waved through by adding a line
 * without someone reading the reason it was allowed.
 */
const KNOWN_COLLISIONS: string[] = [];

function block(name: "light" | "dark"): string {
  const start = name === "light" ? CSS.indexOf(":root {") : CSS.indexOf(".dark {");
  const end = name === "light" ? CSS.indexOf(".dark {") : CSS.length;
  return CSS.slice(start, end);
}

function tokens(mode: "light" | "dark"): Record<string, string> {
  const found: Record<string, string> = {};
  const pattern = /--(state-[a-z-]+|primary|background):\s*(#[0-9a-fA-F]{6})/g;
  for (const match of block(mode).matchAll(pattern)) {
    // First wins: a token is declared once per block.
    found[match[1]] ??= match[2];
  }
  return found;
}

function channels(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];
}

/** Rec. 709 luma - what a greyscale conversion actually produces. */
function greyscale(hex: string): number {
  const [r, g, b] = channels(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG relative luminance, which is not the same curve as the one above. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function collisions(mode: "light" | "dark"): string[] {
  const found = tokens(mode);
  const out: string[] = [];

  for (const [scale, names] of Object.entries(SCALES)) {
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const [a, b] = [names[i], names[j]];
        if (TREATMENT[a] !== TREATMENT[b]) continue;
        const gap = Math.abs(greyscale(found[`state-${a}`]) - greyscale(found[`state-${b}`]));
        if (gap < MIN_GAP) out.push(`${mode} | ${scale} | ${a} vs ${b}`);
      }
    }
  }

  // `unparsed` against the primary action. Not a scale, but the same failure:
  // a filled violet button and a filled fuchsia chip at one luminance means
  // "nothing classified this" reads as "click me".
  //
  // Only checked while `unparsed` renders as a filled pill. It is currently
  // `hatched`, a texture no button in this product has, which separates it from
  // the primary action without depending on luminance at all. Revert that to a
  // fill and this assertion returns on its own - which is the point of reading
  // the treatment from the component instead of hard-coding it.
  if (TREATMENT.unparsed === "solid") {
    const gap = Math.abs(greyscale(found["state-unparsed"]) - greyscale(found.primary));
    if (gap < MIN_GAP) out.push(`${mode} | chrome | unparsed vs primary`);
  }

  return out;
}

describe("semantic state scale", () => {
  it("FR-43 keeps every same-treatment pair in a scale apart in greyscale", () => {
    const all = [...collisions("light"), ...collisions("dark")].sort();
    // Asserted exactly, in both directions: a NEW collision fails, and so does
    // a documented one that has been fixed but not removed from the list.
    expect(all).toEqual([...KNOWN_COLLISIONS].sort());
  });

  it("keeps every state colour readable against its own background", () => {
    // Collected rather than asserted one at a time, so a failure names every
    // offending token and its ratio instead of stopping at the first.
    const failures: string[] = [];
    for (const mode of ["light", "dark"] as const) {
      const found = tokens(mode);
      for (const [name, hex] of Object.entries(found)) {
        if (!name.startsWith("state-")) continue;
        const ratio = contrast(hex, found.background);
        if (ratio < MIN_CONTRAST) {
          failures.push(`${mode}/${name} ${hex} is ${ratio.toFixed(2)}:1, want ${MIN_CONTRAST}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

/**
 * B54 - an opacity modifier on `text-muted-foreground` fails AA at chip size.
 *
 * ## Why this test exists
 *
 * Run `d4000f` propagated `text-muted-foreground/70` into two components it
 * created. At `text-xs` that measures 3.56:1 against `--background` in light and
 * 4.23:1 in dark; AA for normal text is 4.5:1. QA reported the light figure only,
 * so the dark failure would have survived a fix keyed to the reported number -
 * which is why this asserts the computed ratio rather than the class spelling.
 *
 * Dropping the modifier takes the same token to 7.41:1 and 7.76:1.
 *
 * ## The file list became a glob, 2026-08-24 (B63)
 *
 * This test used to name two files - the surfaces run `d4000f` created - and
 * said so: the `/70` debt across the rest of the tree was real, was not this
 * test's business, and widening the list would have failed the suite for work
 * nobody had authorised. It left an instruction for whoever cleaned it up:
 * *"When the list reaches every file that renders muted text, replace it with a
 * glob and delete this paragraph."*
 *
 * That happened. B63 measured **164 failing nodes across 7 authenticated
 * routes** and Erik authorised the cleanup, so the scope is now every file that
 * renders muted text, found by glob rather than by list. A file cannot regress
 * by being left off an array any more.
 */
const AA_GUARDED_FILES = globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() });

/** `bg` shows through `fg` at `alpha`, which is what an opacity modifier does. */
function blend(fg: string, bg: string, alpha: number): string {
  const [fr, fg_, fb] = channels(fg);
  const [br, bg_, bb] = channels(bg);
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return `#${[mix(fr, br), mix(fg_, bg_), mix(fb, bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

function themeColour(mode: "light" | "dark", name: string): string {
  const match = block(mode).match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`--${name} not found in the ${mode} block`);
  return match[1];
}

describe("B54 muted text clears AA on the surfaces this run built", () => {
  it("has no opacity-modified muted-foreground that fails 4.5:1 in either theme", () => {
    const failures: string[] = [];

    for (const file of AA_GUARDED_FILES) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/text-muted-foreground\/(\d{1,3})\b/g)) {
        const alpha = Number(match[1]) / 100;
        for (const mode of ["light", "dark"] as const) {
          const bg = themeColour(mode, "background");
          const ratio = contrast(blend(themeColour(mode, "muted-foreground"), bg, alpha), bg);
          if (ratio < MIN_CONTRAST) {
            failures.push(
              `${file} ${mode} text-muted-foreground/${match[1]} is ${ratio.toFixed(2)}:1, ` +
                `want ${MIN_CONTRAST}`,
            );
          }
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it("can fail - the modifier this run shipped is caught by the same computation", () => {
    // A control. Without it, the test above passes just as well against a file
    // list that no longer exists or a regex that matches nothing, which is the
    // failure this repo has already shipped twice.
    const bg = themeColour("light", "background");
    const ratio = contrast(blend(themeColour("light", "muted-foreground"), bg, 0.7), bg);
    expect(ratio).toBeLessThan(MIN_CONTRAST);
    expect(ratio).toBeCloseTo(3.56, 1);
  });
});
