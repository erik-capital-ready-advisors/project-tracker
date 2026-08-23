import type { Question } from "./types";

/** `questions-zz01.jsonl` -> `zz01`; `questions-u2-zz01.jsonl` -> `zz01`. */
function runFromFilename(name: string): string {
  return name.replace(/\.jsonl$/, "").split("-").at(-1) ?? "unknown";
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The fleet has emitted six different record shapes across six files. Normalize
 * them to one, so "what is still open" becomes a query.
 */
export function normalizeQuestions(
  files: { name: string; text: string }[],
  engagement: string,
): Question[] {
  const questions: Question[] = [];

  for (const file of files) {
    const run = runFromFilename(file.name);
    file.text.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed === "") return;
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      const answer = asString(raw.answer);
      const unit = asString(raw.unit);

      questions.push({
        id: `${engagement}:${run}:${unit ?? "unknown"}:${index}`,
        engagement,
        run: asString(raw.run_id) ?? run,
        unit,
        section: asString(raw.section),
        question: asString(raw.question),
        bestGuess: asString(raw.best_guess) ?? asString(raw.assumption_made),
        confidence: asString(raw.confidence),
        blocking: raw.blocking === true,
        answer,
        answeredBy: asString(raw.answered_by),
        answeredOn: asString(raw.answered_on),
        status: answer === null ? "open" : "answered",
      });
    });
  }
  return questions;
}
