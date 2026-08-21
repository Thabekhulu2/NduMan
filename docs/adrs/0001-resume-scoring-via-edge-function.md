# ADR-0001: Score resume-to-JD fit via a Supabase Edge Function, not a Temporal workflow

- **Status:** Accepted
- **Date:** 2026-08-21
- **Deciders:** Ndumiso Mpanza
- **Supersedes / Superseded by:** none

## Context
The template ships two candidate places to run business logic: Supabase Edge Functions (Deno,
none implemented yet) and a Python Temporal worker (`temporal/`, currently all stub
activities/workflows). The resume → candidate profile feature needs to extract structured data
from a resume and score it against a JD using an LLM, then persist the result, in response to a
single user submission.

Constraints on this machine/repo: Python is not installed locally, so the Temporal worker cannot
be run or tested end-to-end today. The Supabase CLI (which bundles the Deno runtime used to run
and test Edge Functions locally via `supabase functions serve`) is installed and working. The
scoring itself is one LLM call with no retries, no human-in-the-loop step, and no need to survive
process restarts — it either succeeds within the request or the user resubmits.

## Decision
We implement `score-resume-fit` as a Supabase Edge Function (Deno + Anthropic SDK via `npm:`
specifiers), called synchronously from the frontend via `supabase.functions.invoke()`, rather than
as a Temporal workflow/activity.

## Consequences
- The UX is simple: submit → wait → see the scorecard, with no polling or webhook needed.
- It's testable end-to-end today (`supabase functions serve` + `curl`, then the real UI) without
  installing Python or standing up the Temporal docker-compose stack.
- If scoring later needs retries, batching many resumes against one JD, or a human-approval step
  before persisting, this should move to (or be fronted by) a Temporal workflow — the existing
  `ApprovalWorkflow` example and `supabase_core` activity stubs are the pattern to extend at that
  point. That migration is not done now; revisit with a new ADR if/when it's needed.
- The Python Temporal worker in this repo remains unused by this feature.

## Alternatives considered
- **Temporal workflow (Python)**: better fit for retryable/long-running/human-in-the-loop work,
  and it's the template's designated place for exactly that. Rejected for v1 because it isn't
  runnable locally right now (no Python), and the feature as scoped doesn't need retries, batching,
  or a wait step — the added operational surface (worker process, docker-compose, task queue)
  isn't justified yet.
- **Client-side LLM call directly from the frontend**: would leak the Anthropic API key to the
  browser. Rejected on security grounds.

## Evidence
- `supabase/functions/score-resume-fit/index.ts` — the Edge Function.
- `supabase/migrations/*_resume_fit_scoring.sql` — supporting `fact_types` rows and bucket
  policies.
- `docs/specs/resume-candidate-profile.md` — feature spec this decision supports.
