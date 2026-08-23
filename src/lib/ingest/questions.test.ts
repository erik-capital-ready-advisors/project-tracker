import { describe, it, expect } from "vitest";
import { normalizeQuestions } from "./questions";
import { QUESTION_FILES } from "./__fixtures__/questions";

const load = () => normalizeQuestions(QUESTION_FILES, "tracker");

describe("normalizeQuestions", () => {
  it("FR-18 reads every record across every file", () => {
    expect(load()).toHaveLength(5);
  });

  it("FR-18 gives every record the same key set", () => {
    const shapes = new Set(load().map((q) => Object.keys(q).sort().join(",")));
    expect(shapes.size).toBe(1);
  });

  it("FR-18 separates answered from open", () => {
    const answered = load().filter((q) => q.status === "answered");
    expect(answered).toHaveLength(1);
    expect(answered[0].answeredBy).toBe("erik");
  });

  it("FR-18 reads assumption_made as a best guess", () => {
    const shapeTwo = load().find((q) => q.unit === "i4" && q.bestGuess === "Treated as standalone");
    expect(shapeTwo).toBeDefined();
  });

  it("FR-18 takes the run from the filename when the record omits it", () => {
    expect(new Set(load().map((q) => q.run))).toEqual(new Set(["zz01", "zz02"]));
  });

  it("FR-18 gives every record a distinct id", () => {
    const ids = load().map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
