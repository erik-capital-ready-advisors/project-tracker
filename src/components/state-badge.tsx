import { cn } from "@/lib/utils";

/**
 * The semantic state scale, applied in exactly one place.
 *
 * Spec 5a: "Semantic state colors are a separate scale from the accent and
 * carry meaning consistently across every surface: verified, carried, blocked,
 * decided-against, and unparsed each keep one color everywhere they appear."
 *
 * Three requirements forbid collapsing states into each other, and every one of
 * them is a distinct entry below rather than a shared "close enough" colour:
 *
 *   FR-43  the four evidence scopes -- observed-live, observed-elsewhere,
 *          asserted, not-verified -- are distinct and never collapsed
 *   FR-49  `unproven` is distinct from `uncovered`
 *   FR-30  `carried` is distinct from `closed`
 *
 * Two channels carry the meaning, because hue alone cannot separate this many
 * states legibly:
 *
 *   HUE        the family -- what kind of state this is
 *   TREATMENT  the confidence -- solid means observed or derived firmly,
 *              outline means asserted or decided, dashed means absent or
 *              unverified
 *
 * The treatment channel is what keeps the four evidence scopes distinguishable
 * in greyscale and to a colour-blind reader, which is the actual reason FR-43
 * cannot be satisfied by hue alone.
 *
 * `tests/state-scale.test.ts` asserts that claim against the actual token
 * values rather than trusting this comment. It reads `STATE_TREATMENT` below,
 * so changing a treatment here changes what that test requires of the colours.
 */

export type WorkState =
  // spec 5a, the five named
  | "verified"
  | "carried"
  | "blocked"
  | "decided-against"
  | "unparsed"
  // FR-30
  | "closed"
  // CR-001 FR-63 / FR-67, defect status
  | "open"
  | "fixed"
  | "wont_fix"
  // CR-001 FR-79
  | "contested"
  // FR-43, the four evidence scopes
  | "observed-live"
  | "observed-elsewhere"
  | "asserted"
  | "not-verified"
  // FR-49
  | "unproven"
  | "uncovered";

/**
 * `hatched` belongs to `unparsed` alone.
 *
 * The other three carry confidence. This one carries *incomparability*: an
 * unparsed row is not a weaker version of a classified one, it is a row nothing
 * could classify. It is a separate treatment rather than a fourth colour
 * because the collision measured on 2026-08-20 was with `--primary`, not with
 * another state - 0.3 apart in greyscale in light, 0.9 in dark - and hue had no
 * room left to fix it. Texture is not a colour, so it survives desaturation and
 * colour blindness outright.
 */
type Treatment = "solid" | "outline" | "dashed" | "hatched";

const STATE_STYLE: Record<WorkState, { color: string; treatment: Treatment }> = {
  verified: { color: "state-verified", treatment: "solid" },
  carried: { color: "state-carried", treatment: "solid" },
  blocked: { color: "state-blocked", treatment: "solid" },
  "decided-against": { color: "state-decided-against", treatment: "outline" },
  unparsed: { color: "state-unparsed", treatment: "hatched" },

  closed: { color: "state-closed", treatment: "outline" },

  open: { color: "state-open", treatment: "outline" },
  fixed: { color: "state-fixed", treatment: "solid" },
  wont_fix: { color: "state-wont-fix", treatment: "dashed" },

  contested: { color: "state-contested", treatment: "solid" },

  "observed-live": { color: "state-observed-live", treatment: "solid" },
  "observed-elsewhere": {
    color: "state-observed-elsewhere",
    treatment: "solid",
  },
  asserted: { color: "state-asserted", treatment: "outline" },
  "not-verified": { color: "state-not-verified", treatment: "dashed" },

  unproven: { color: "state-unproven", treatment: "dashed" },
  uncovered: { color: "state-uncovered", treatment: "dashed" },
};

/**
 * Tailwind cannot see a class name assembled at runtime, so every utility this
 * component can emit is written out literally here. Adding a state means adding
 * its row to both maps.
 */
const CLASS_BY_STATE: Record<WorkState, string> = {
  verified: "border-state-verified/40 bg-state-verified/10 text-state-verified",
  carried: "border-state-carried/40 bg-state-carried/10 text-state-carried-ink",
  blocked: "border-state-blocked/40 bg-state-blocked/10 text-state-blocked",
  "decided-against":
    "border-state-decided-against/40 text-state-decided-against bg-transparent",
  unparsed:
    "border-state-unparsed/60 text-state-unparsed bg-transparent state-hatch",

  closed: "border-state-closed/40 text-state-closed bg-transparent",

  open: "border-state-open/50 text-state-open bg-transparent",
  fixed: "border-state-fixed/40 bg-state-fixed/10 text-state-fixed-ink",
  wont_fix:
    "border-state-wont-fix/50 text-state-wont-fix bg-transparent border-dashed",

  contested:
    "border-state-contested/50 bg-state-contested/10 text-state-contested-ink ring-1 ring-state-contested/30",

  "observed-live":
    "border-state-observed-live/40 bg-state-observed-live/10 text-state-observed-live",
  "observed-elsewhere":
    "border-state-observed-elsewhere/40 bg-state-observed-elsewhere/10 text-state-observed-elsewhere",
  asserted: "border-state-asserted/50 text-state-asserted bg-transparent",
  "not-verified":
    "border-state-not-verified/50 text-state-not-verified bg-transparent border-dashed",

  unproven:
    "border-state-unproven/50 text-state-unproven bg-transparent border-dashed",
  uncovered:
    "border-state-uncovered/50 text-state-uncovered bg-transparent border-dashed",
};

/** Human label. `wont_fix` is the only state whose stored form is not readable. */
const LABEL_BY_STATE: Partial<Record<WorkState, string>> = {
  wont_fix: "won't fix",
};

export function StateBadge({
  state,
  className,
}: {
  state: WorkState;
  className?: string;
}) {
  return (
    <span
      data-verify-unit="state-badge"
      data-verify-state={state}
      data-verify-treatment={STATE_STYLE[state].treatment}
      className={cn(
        "ident inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        CLASS_BY_STATE[state],
        className,
      )}
    >
      {LABEL_BY_STATE[state] ?? state}
    </span>
  );
}

/** Exported so a later unit can enumerate the scale without re-deriving it. */
export const ALL_WORK_STATES = Object.keys(STATE_STYLE) as WorkState[];

/**
 * The treatment each state renders with, exported so the greyscale test reads
 * the real mapping instead of keeping a copy that can drift out of date.
 */
export const STATE_TREATMENT = Object.fromEntries(
  Object.entries(STATE_STYLE).map(([state, style]) => [state, style.treatment]),
) as Record<WorkState, Treatment>;
