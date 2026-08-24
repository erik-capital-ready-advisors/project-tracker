import { describe, it, expect } from "vitest";

import { PROD_MD, PROD_MD_EMPTY, PROD_MD_UNKNOWN_SHAPES } from "./__fixtures__/runState";
import { parseProdMd } from "./prodMd";

describe("parseProdMd", () => {
  const result = parseProdMd(PROD_MD, "widget");

  it("FR-20 reads every milestone row across both phase tables", () => {
    expect(result.milestones.map((m) => m.name)).toEqual([
      "M1.0 Provisioning",
      "M1.1 Foundation",
      "M1.2 Access",
      "M1.3 Registry",
      "M1.4 Ingest",
      "M2.1 Probes",
    ]);
  });

  it("FR-20 classifies each of the six status words the artifacts write", () => {
    expect(result.milestones.map((m) => m.status)).toEqual([
      "complete",
      "complete",
      "in_progress",
      "not_started",
      "blocked",
      "deferred",
    ]);
  });

  it("FR-20 keeps the status cell verbatim alongside the classification", () => {
    expect(result.milestones[0].rawStatus).toBe("**Done**");
    expect(result.milestones[4].rawStatus).toBe("**Blocked**");
  });

  it("FR-15 a status word the artifacts do not use is unparsed, never the nearest match", () => {
    const unknown = parseProdMd(PROD_MD_UNKNOWN_SHAPES, "widget");
    expect(unknown.milestones.map((m) => m.status)).toEqual([
      "unparsed",
      "unparsed",
      "unparsed",
    ]);
    // B59 changed this number from 3 to 4, and the fixture was NOT touched.
    // Three milestone rows carry a status word this parser refuses to guess at
    // (`Nearly done`, `Started`, an emoji). The fourth is the blocker row whose
    // ID cell names no `Bn`: it is a well-formed row that yields no record, and
    // before B59 it left no count either -- absent from the numerator and the
    // denominator both. `blockers` is still `[]`, asserted below: nothing is
    // invented for it, it is merely no longer forgotten.
    expect(unknown.unparsed).toBe(4);
  });

  it("FR-58 reports zero unparsed when every row classified", () => {
    expect(result.unparsed).toBe(0);
  });

  it("FR-20 reads the active blockers and their identifiers", () => {
    expect(result.blockers.map((b) => b.id)).toEqual([
      "widget:B1a",
      "widget:B1b",
      "widget:B3",
      "widget:B9",
    ]);
  });

  it("FR-20 a struck-through blocker row is closed, an unstruck one is carried", () => {
    expect(result.blockers.map((b) => b.disposition)).toEqual([
      "closed",
      "carried",
      "carried",
      "carried",
    ]);
  });

  it("FR-52 the owner comes from the artifact's Owner column, including a vendor", () => {
    expect(result.blockers.map((b) => b.owner)).toEqual([
      "erik",
      "erik",
      "erik",
      "vendor",
    ]);
  });

  it("FR-52 a blocker row stating no owner defaults to erik, not to client", () => {
    const noOwner = parseProdMd(
      [
        "## Active blockers",
        "",
        "| ID | Blocker | Owner | Blocks | Resolution path |",
        "|---|---|---|---|---|",
        "| **B4** | Nobody wrote an owner down | | Nothing | |",
      ].join("\n"),
      "widget",
    );
    expect(noOwner.blockers[0].owner).toBe("erik");
  });

  it("FR-20 a blocker row naming no Bn identifier is dropped, never given an invented one", () => {
    expect(parseProdMd(PROD_MD_UNKNOWN_SHAPES, "widget").blockers).toEqual([]);
  });

  it("FR-20 strips the markdown wraps from the description it stores", () => {
    const b1b = result.blockers.find((b) => b.id === "widget:B1b");
    expect(b1b?.description).toBe(
      "The connector cannot see the project. Scope-limited token",
    );
  });

  it("FR-20 a prod.md with neither section yields no records rather than an error", () => {
    const empty = parseProdMd(PROD_MD_EMPTY, "widget");
    expect(empty.milestones).toEqual([]);
    expect(empty.blockers).toEqual([]);
    expect(empty.unparsed).toBe(0);
  });

  it("FR-23 reads no filesystem — the same text yields the same records", () => {
    expect(parseProdMd(PROD_MD, "widget")).toEqual(parseProdMd(PROD_MD, "widget"));
  });
});
