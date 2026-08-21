-- Resume -> candidate profile fit scoring
-- Created: 2026-08-21
-- Purpose: register the fact types used by score-resume-fit, and scope storage
-- access to the "resumes" bucket. No new relational tables -- resumes, job
-- descriptions, and scoring results are modeled with the generic
-- entities/entity_versions/relationships_v2/entity_facts/time_series_points
-- tables from 20251202090000_core_entity_model.sql and
-- 20251203090000_analytics_foundation.sql.

insert into fact_types (key, label, description, unit)
values
  ('resume_jd_fit_score', 'Resume/JD Fit Score', 'LLM-assessed fit of a resume against a job description', 'score_0_100'),
  ('resume_jd_skill_overlap_count', 'Resume/JD Skill Overlap Count', 'Number of JD-required skills matched in the resume', 'count')
on conflict (key) do nothing;

-- Storage: the "resumes" bucket (declared in supabase/config.toml) is private.
-- The rest of this template's frontend uses the anon key with no login flow,
-- so these policies scope access to the resumes bucket for the anon role,
-- consistent with that existing (documented, out-of-scope-to-fix-here) gap.
create policy "resumes bucket anon insert"
  on storage.objects for insert
  to anon
  with check (bucket_id = 'resumes');

create policy "resumes bucket anon select"
  on storage.objects for select
  to anon
  using (bucket_id = 'resumes');
