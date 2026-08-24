-- Delivery Ledger — B47. Backfill `defect.source_key` into its run namespace.
--
-- ---------------------------------------------------------------------------
-- What was wrong
-- ---------------------------------------------------------------------------
-- `plan.ts` built every defect's source_key from the constant `qa-report`, so
-- the key was stable across re-posts of one run (which FR-22 needs) and
-- IDENTICAL across different runs (which nothing wanted). `defect` is upserted
-- on the unique index (engagement_id, source_key), so a second run's QA report
-- posted into the same engagement UPDATED the first run's defect rows instead
-- of adding its own — silently, and only on the second run, which is the case
-- nobody exercises before shipping.
--
-- Measured rather than argued: a test planning two runs' reports into one
-- engagement returned the colliding keys `qa-report#0`, `#1`, `#2`.
--
-- The code fix makes the namespace `qa-report-<run id>`. This migration moves
-- the 13 rows already written under the old namespace so they keep matching
-- what ingest now generates. Without it, re-ingesting b0952e allocates a second
-- set of D-nn refs beside the originals.
--
-- ---------------------------------------------------------------------------
-- Why hardcoding a run id here would be wrong, and what is done instead
-- ---------------------------------------------------------------------------
-- There is no run->defect edge in this schema — that absence is the same gap
-- FR-93 ran into. So which run these 13 rows belong to cannot be read off the
-- rows; it is inferred from the fact that exactly one run has ever been
-- ingested. That inference is guarded rather than trusted: if a second run
-- exists, the assumption is void and this migration REFUSES rather than
-- guessing which findings belong to which run.
--
-- Applied 2026-08-24. Observed after: 13 of 13 rows rekeyed, 0 left under the
-- old namespace, 13 distinct source_keys over 13 distinct refs — so nothing
-- collapsed into a neighbour on the way.
--
-- Reverse, if it is ever needed:
--   update public.defect
--      set source_key = 'qa-report#' || split_part(source_key, '#', 2)
--    where source_key like 'qa-report-%#%';

do $$
declare
  v_run_count  int;
  v_run_id     text;
  v_engagement uuid;
  v_affected   int;
begin
  select count(*) into v_run_count from public.fleet_run;

  if v_run_count <> 1 then
    raise exception
      'refusing to backfill: this migration infers the run from there being '
      'exactly one, and found %. Assign the rows by hand.', v_run_count;
  end if;

  select run_id, engagement_id into v_run_id, v_engagement from public.fleet_run;

  update public.defect
     set source_key = 'qa-report-' || v_run_id || '#' || split_part(source_key, '#', 2)
   where source_key like 'qa-report#%'
     and engagement_id = v_engagement;

  get diagnostics v_affected = row_count;
  raise notice 'B47: rekeyed % defect(s) into namespace qa-report-%', v_affected, v_run_id;
end $$;
