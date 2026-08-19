import { parseBlocked } from "./blocked";
import { normalizeQuestions } from "./questions";
import { parseRequirements } from "./requirements";
import { parseTestTags } from "./testTags";
import { parseWorkUnits } from "./workUnits";
import { validateWorkItem } from "./types";
import type { Blocker, Question, Requirement, TestCase, WorkItem } from "./types";

export interface RunInput {
  engagement: string;
  manifests: { name: string; text: string }[];
  questionFiles: { name: string; text: string }[];
  specText: string | null;
  testFiles: { path: string; source: string }[];
}

export interface RunResult {
  workItems: WorkItem[];
  blockers: Blocker[];
  questions: Question[];
  requirements: Requirement[];
  tests: TestCase[];
  unparsed: number;
  errors: string[];
}

/** `manifest-zz01.md` -> `zz01`. */
function runIdFromName(name: string): string {
  return name.replace(/\.md$/, "").split("-").at(-1) ?? "unknown";
}

export function ingestRun(input: RunInput): RunResult {
  const workItems: WorkItem[] = [];
  const blockers: Blocker[] = [];

  for (const manifest of input.manifests) {
    const run = runIdFromName(manifest.name);
    workItems.push(...parseWorkUnits(manifest.text, input.engagement, run));
    const blocked = parseBlocked(manifest.text, input.engagement, run);
    workItems.push(...blocked.items);
    blockers.push(...blocked.blockers);
  }

  return {
    workItems,
    blockers,
    questions: normalizeQuestions(input.questionFiles, input.engagement),
    requirements:
      input.specText === null ? [] : parseRequirements(input.specText, input.engagement),
    tests: parseTestTags(input.testFiles, input.engagement),
    unparsed: workItems.filter((item) => item.status === "unparsed").length,
    errors: workItems.flatMap(validateWorkItem),
  };
}
