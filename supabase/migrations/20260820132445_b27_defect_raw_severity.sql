-- Delivery Ledger — B27, second half. One additive column, same table, same
-- §7a row (CR-001 §4), no grant added or changed.
--
-- `parseQaFindings` returns `rawSeverity` — the grading word the report actually
-- used — alongside the mapped `severity` enum, and there was nowhere to put it.
-- Writing the mapped value alone would have thrown away the artifact's own words
-- at the moment of ingest, which is the move this project's central rule forbids:
-- emit what an artifact says, and where two artifacts disagree, record both.
--
-- `work_item.raw_status` is the precedent and this is the same shape. The fixture
-- for the findings parser is built on exactly this case: a QA agent grades a
-- finding `Important` where FR-63's enum has `major`. Both are true, and they are
-- different facts.
--
-- It matters most where `severity` is `unparsed`. Without this column the Broken
-- screen can say only that nothing could classify a finding — not what the
-- finding claimed to be. That is a loud failure degraded into a silent one.

alter table public.defect add column raw_severity text;

comment on column public.defect.raw_severity is
  'The severity word the artifact actually used, kept verbatim beside the mapped '
  '`severity` enum — the same role `work_item.raw_status` plays. A QA agent grades '
  '`Important` where FR-63''s enum says `major`, and both are true: one is what was '
  'written, the other is what this product classified it as. Load-bearing when '
  '`severity` is `unparsed`, because without it the screen can say only that nothing '
  'classified the finding, not what it said. Clear text: a single grading word from a '
  'report, carrying no client prose, so CR-001 §4''s class for this table is unchanged.';
