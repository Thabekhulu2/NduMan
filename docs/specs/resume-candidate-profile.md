# Resume → Structured Candidate Profile

## Overview
Upload a resume and a job description; the system extracts structured skills/experience from the
resume, scores fit against the JD with reasoning, persists the result, and shows a scorecard next
to the resume in the UI.

## Metadata
- **Feature Name**: Resume → Structured Candidate Profile
- **Status**: In Development
- **Priority**: P1 - High
- **Owner**: Ndumiso Mpanza
- **Created**: 2026-08-21
- **Last Updated**: 2026-08-21

## Problem Statement

### User Problem
Manually reading a resume against a job description to judge fit is slow and inconsistent across
reviewers.

### Current State
No tooling exists in this repo for resume intake or JD matching.

### Desired State
A reviewer pastes/uploads a resume and a JD, and within seconds sees a structured profile (skills,
experience, education) plus a 0–100 fit score with matched/missing skills and a written rationale.

## Goals and Non-Goals

### Goals
- Extract structured skills/experience/education from resume text.
- Score fit (0–100) against a job description, with a written rationale and matched/missing skill
  lists.
- Persist resume, JD, and scoring result so they can be revisited later.
- Show the scorecard next to the resume/JD input in one view.

### Non-Goals
- Authentication/authorization, multi-tenant access control, or reviewer accounts — the whole
  template currently runs on the anon key with no login flow; adding real auth is a separate
  effort, not part of this feature.
- Server-side PDF text extraction — v1 accepts resume text directly (typed/pasted, or extracted
  by the browser before submit); the uploaded file itself is still stored for the record.
- Bulk/batch scoring, ranking multiple candidates against one JD, or an async/retryable pipeline
  (see ADR-0001 for why this is synchronous, not a Temporal workflow).
- Retrofitting Row Level Security onto the template's existing entity tables — out of scope here;
  see ADR-0001 and `Guide_for_agents_using_supabase_template.md` §10.4 for the existing gap.

### Success Metrics
- A user can go from pasting a resume + JD to seeing a scorecard in under ~15 seconds (mostly LLM
  latency).
- The scoring result and its inputs are queryable afterward via `entities`/`entity_facts`.

## User Stories

### Primary User Story
```
As a hiring reviewer,
I want to submit a resume and a job description together,
So that I get a structured candidate profile and a fit score with reasoning, without reading
the full resume myself first.
```

**Acceptance Criteria:**
- [ ] Submitting a resume + JD returns skills, experience, education, a 0–100 fit score, matched
      skills, missing skills, and a reasoning paragraph.
- [ ] The result is shown in a scorecard next to the resume/JD form on the same page.
- [ ] The resume file (if uploaded) is stored in Supabase Storage; the resume, JD, and score are
      persisted as rows queryable from Supabase Studio.
- [ ] A scoring failure (e.g. missing API key, LLM error) surfaces a visible error instead of a
      silent no-op.

## Requirements

### Functional Requirements

#### Must Have (P0)
- Resume text + JD text input, optional resume file upload for record-keeping.
- `score-resume-fit` Edge Function: calls Claude with a tool-use schema to force structured JSON
  output, persists results, returns them to the caller.
- Scorecard UI rendered next to the input form.

#### Should Have (P1)
- Audit trail of scoring attempts (`time_series_points`) so re-scoring history isn't lost.

#### Nice to Have (P2)
- Server-side PDF text extraction (upload a PDF directly, no manual text paste).
- Ranking multiple resumes against one JD.

### Non-Functional Requirements
- **Security**: Storage bucket for resumes is private (`public = false`); scoped bucket policies
  only, no broader RLS changes (see Non-Goals).
- **Reliability**: A scoring failure must not leave partial/inconsistent DB rows — writes happen
  after the LLM call succeeds.

## Technical Design

### Architecture
```
Frontend (UIEngine page)          Supabase
┌─────────────────────┐   invoke   ┌───────────────────────────┐
│ resume-scorecard.json│──────────▶│ Edge Function              │
│  form + scorecard    │◀──────────│  score-resume-fit          │
└─────────────────────┘   result   │  → Claude (tool use)       │
                                    │  → entities/entity_versions│
                                    │  → relationships_v2        │
                                    │  → entity_facts            │
                                    │  → time_series_points      │
                                    └───────────────────────────┘
```
See ADR-0001 for why this is an Edge Function rather than a Temporal workflow.

### API

`POST /functions/v1/score-resume-fit`

**Request:**
```json
{
  "candidateName": "Jane Doe",
  "resumeText": "raw resume text...",
  "jdText": "raw job description text...",
  "resumeFilePath": "resumes/<uuid>.pdf"
}
```

**Response:**
```json
{
  "resumeEntityId": "uuid",
  "jdEntityId": "uuid",
  "fitScore": 78,
  "reasoning": "Strong backend overlap, missing required cloud cert...",
  "matchedSkills": ["Python", "PostgreSQL"],
  "missingSkills": ["AWS", "Kubernetes"],
  "extracted": {
    "skills": ["Python", "PostgreSQL", "..."],
    "experience": [{ "role": "...", "company": "...", "years": 3 }],
    "education": ["..."]
  }
}
```

### Data Model
Reuses the template's generic entity model — no new relational tables:
- `entities`: `entity_type = 'resume'` and `'job_description'`.
- `entity_versions.data` (jsonb): raw text + extracted skills/experience/education.
- `relationships_v2`: `relationship_type = 'scored_against'` linking resume → JD.
- `fact_types`: new rows `resume_jd_fit_score` (unit `score_0_100`),
  `resume_jd_skill_overlap_count` (unit `count`).
- `entity_facts`: the numeric fit score, with `metadata` holding reasoning/matched/missing skills.
- `time_series_points`: one row per scoring attempt, as an audit trail.

### Security Considerations
- `ANTHROPIC_API_KEY` is an Edge Function secret (`supabase secrets set`), never committed.
- Resume Storage bucket is private; access is via scoped bucket policies only (see ADR-0001 and
  Non-Goals re: RLS on core tables).

## Implementation Plan

### Phases
- **Phase 1** — Storage bucket + migration (`fact_types` rows, bucket policies).
- **Phase 2** — `score-resume-fit` Edge Function (extraction + scoring + persistence).
- **Phase 3** — Frontend: file upload component, custom action handler, scorecard page/route/nav.
- **Phase 4** — Local verification (`supabase db reset`, `functions serve` + curl, `npm run dev`
  click-through) and PR for review.

### Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| LLM output doesn't match the expected JSON shape | Broken scorecard | Use Anthropic tool-use (forced schema), not free-form parsing |
| No `ANTHROPIC_API_KEY` set locally | Function fails | Documented in `.env.example` and this spec; error surfaces in the UI |

## Testing Strategy
- Manual: `supabase functions serve` + `curl` with sample resume/JD text.
- Manual: full click-through in the browser (`npm run dev`), verifying DB rows in Supabase Studio.
- No automated test suite exists yet in this template (per `AGENTS.md`); none added here beyond
  what's already noted as a gap.

## Open Questions
- [ ] Should re-scoring the same resume/JD pair create a new `entity_versions`/`time_series_points`
      row (full history) or overwrite the current `entity_facts` value? Current design: both —
      history is kept, current fact is upserted. Revisit if this needs trimming.

## References
- `AGENTS.md`, `DATABASE.md`, `Guide_for_agents_using_supabase_template.md` — schema conventions.
- `docs/adrs/0001-resume-scoring-via-edge-function.md` — architecture decision.
