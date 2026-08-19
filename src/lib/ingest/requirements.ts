import type { Requirement } from "./types";

const FR = /\bFR-(\d+)\b/g;
const MAX_TEXT = 300;

/** First mention of each `FR-nn` wins; its line becomes the requirement text. */
export function parseRequirements(text: string, engagement: string): Requirement[] {
  const seen = new Map<number, Requirement>();

  for (const line of text.split("\n")) {
    for (const match of line.matchAll(FR)) {
      const number = Number(match[1]);
      if (seen.has(number)) continue;
      seen.set(number, {
        id: `${engagement}:FR-${number}`,
        engagement,
        ref: `FR-${number}`,
        text: line.trim().slice(0, MAX_TEXT),
      });
    }
  }

  // The one non-null assertion in this package, and it is warranted: the key
  // came out of `seen.keys()`, so `seen.get(n)` cannot be undefined.
  return [...seen.keys()].sort((a, b) => a - b).map((n) => seen.get(n)!);
}
