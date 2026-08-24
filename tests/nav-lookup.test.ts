import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { OPERATOR_ROUTES } from "@/lib/nav";

/**
 * B44. Six pages read their own nav metadata as `OPERATOR_ROUTES[0]`…`[5]`.
 *
 * A mis-index does not crash. It renders a screen under ANOTHER screen's title,
 * question and requirement list -- on a product whose whole thesis is never to
 * tell Erik something false, and on a surface no agent could see at the time it
 * was introduced. Run `29b583` added the sixth such reader; `u2` correctly
 * refused to insert mid-array (which would have swapped the two settings pages'
 * titles) and appended instead, then adopted the fragile pattern for its own
 * page.
 *
 * A test that asserted the CURRENT indices are right would pass today and pass
 * again the moment someone reorders the array -- it would encode the bug. These
 * assert the property instead: nobody indexes positionally, and `href` is a key
 * that `.find` can rely on.
 */
describe("nav metadata is looked up by href, never by index (B44)", () => {
  it("every OPERATOR_ROUTES href is unique, so .find is unambiguous", () => {
    const hrefs = OPERATOR_ROUTES.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("no source file indexes OPERATOR_ROUTES positionally", () => {
    const files = globSync("src/**/*.{ts,tsx}", { cwd: process.cwd() });
    const offenders = files.filter((relative) => {
      const text = readFileSync(join(process.cwd(), relative), "utf8");
      // Strip comments: nav.ts and runs/page.tsx both DESCRIBE the old pattern
      // in prose, and a match in prose is evidence of the opposite.
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      return /OPERATOR_ROUTES\s*\[\s*\d+\s*\]/.test(code);
    });
    expect(offenders).toEqual([]);
  });
});
