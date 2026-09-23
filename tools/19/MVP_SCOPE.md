# Compass Team 19 - MVP1 Scope (Edited)

## Scope Goal
Deliver a reliable event-ingestion foundation for Compass that can be demoed and safely extended.

MVP1 is backend-first and intentionally narrow: ingest, normalize, upsert, and manually trigger Penn/Wharton ICS events.

## In Scope (MVP1)

1. Postgres schema for event ingestion
- `events` table with normalized ICS fields and timestamps
- `ingestion_runs` table for run-level observability
- indexes for `external_event_id` uniqueness and `start_time` querying

2. ICS ingestion pipeline
- fetch feed from `COMPASS_ICS_FEED_URL`
- parse VEVENT entries only
- map ICS fields:
  - `UID` -> `external_event_id`
  - `SUMMARY` -> `title`
  - `DESCRIPTION` -> `description`
  - `DTSTART` -> `start_time`
  - `DTEND` -> `end_time`
  - `LOCATION` -> `location`
  - `URL` -> `registration_url`
  - `ORGANIZER` -> `organizer` (best-effort)
- tolerate missing optional fields
- keep past events; no deletion policy yet

3. Idempotent upsert behavior
- upsert by `external_event_id`
- repeated syncs must update existing rows, not duplicate
- persist sync stats (`inserted`, `updated`, duration, status)

4. Manual sync trigger for development/testing
- one callable route under Team 19 app path
- returns machine-readable status payload for quick debugging

5. Modular structure for later scheduling
- keep sync orchestration isolated so cron/scheduled jobs can call the same function later

## Explicitly Out of Scope (MVP1)

1. User/auth tables and Supabase auth setup
2. Onboarding and priority ranking UX
3. Event recommendation/ranking logic
4. Save/register interaction tracking
5. Reflection capture flow
6. AI summaries or insights generation
7. Event detail pages and advanced filters/search
8. Multi-feed de-duplication or external source fusion

## Functional Definition of Done

1. Migrations exist and apply for `events` and `ingestion_runs`
2. Manual sync endpoint can ingest real ICS feed in dev
3. Ingestion is resilient to missing optional ICS metadata
4. Re-running sync does not create duplicates
5. Past events remain stored after syncs
6. Build/typecheck succeeds for Team 19 package and web app integration

## Demo Checklist

1. Trigger sync manually
2. Show response payload with totals and duration
3. Query DB to show newly inserted/updated rows
4. Re-run sync and show idempotent behavior

## Risks and Guardrails

1. ICS metadata inconsistencies
- Guardrail: strict type checks and nullable mapping

2. Missing registration URL
- Guardrail: store `null`; do not invent unsafe links

3. Runtime/debug ambiguity
- Guardrail: ingestion run logs plus structured error responses

## Next Scope (MVP2 Candidate)

1. Basic events dashboard UI (read-only upcoming events)
2. Saved events interaction model
3. Reflection capture and storage
4. AI summary pipeline over reflections
