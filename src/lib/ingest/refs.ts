const FR_RANGE = /FR-(\d+)(?:\s*(?:to|–|—)\s*FR-(\d+))?/g;

/**
 * `FR-43 to FR-46`, `FR-1–FR-3` and `FR-36, FR-39 to FR-41` all expand to every
 * reference they name. The manifests use all three forms.
 */
export function requirementRefs(text: string | null | undefined): string[] {
  const numbers = new Set<number>();
  for (const match of (text ?? "").matchAll(FR_RANGE)) {
    const low = Number(match[1]);
    const high = match[2] === undefined ? low : Number(match[2]);
    for (let n = low; n <= high; n += 1) numbers.add(n);
  }
  return [...numbers].sort((a, b) => a - b).map((n) => `FR-${n}`);
}
