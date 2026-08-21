// score-resume-fit
//
// Given a resume and a job description (as text), extracts a structured
// candidate profile and scores fit against the JD via Claude tool use, then
// persists everything using the template's generic entity model (see
// docs/specs/resume-candidate-profile.md and docs/adrs/0001-*.md).

import Anthropic from "npm:@anthropic-ai/sdk@0.68.0";
import { createClient } from "npm:@supabase/supabase-js@2.86.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ScoreRequest {
  candidateName?: string;
  resumeText: string;
  jdText: string;
  resumeFilePath?: string;
}

interface ExtractionResult {
  skills: string[];
  experience: { role: string; company: string; years: number }[];
  education: string[];
  fit_score: number;
  reasoning: string;
  matched_skills: string[];
  missing_skills: string[];
}

const EXTRACT_AND_SCORE_TOOL = {
  name: "extract_and_score_candidate",
  description:
    "Record the structured candidate profile extracted from a resume, and the fit score of that " +
    "resume against a job description.",
  input_schema: {
    type: "object" as const,
    properties: {
      skills: {
        type: "array",
        items: { type: "string" },
        description: "Skills found in the resume.",
      },
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            role: { type: "string" },
            company: { type: "string" },
            years: { type: "number", description: "Approximate years in this role." },
          },
          required: ["role", "company", "years"],
        },
      },
      education: {
        type: "array",
        items: { type: "string" },
        description: "Education entries (degree, institution) found in the resume.",
      },
      fit_score: {
        type: "integer",
        description: "Overall fit of the resume against the job description, 0-100.",
      },
      reasoning: {
        type: "string",
        description: "A short paragraph explaining the fit score.",
      },
      matched_skills: {
        type: "array",
        items: { type: "string" },
        description: "JD-required skills that the resume demonstrates.",
      },
      missing_skills: {
        type: "array",
        items: { type: "string" },
        description: "JD-required skills the resume does not demonstrate.",
      },
    },
    required: [
      "skills",
      "experience",
      "education",
      "fit_score",
      "reasoning",
      "matched_skills",
      "missing_skills",
    ],
    additionalProperties: false,
  },
};

async function extractAndScore(resumeText: string, jdText: string): Promise<ExtractionResult> {
  const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

  const response = await anthropic.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    output_config: { effort: "low" },
    tools: [EXTRACT_AND_SCORE_TOOL],
    tool_choice: { type: "tool", name: EXTRACT_AND_SCORE_TOOL.name },
    messages: [
      {
        role: "user",
        content:
          "Extract a structured candidate profile from this resume, then score its fit against " +
          "the job description below (0-100), with matched and missing skills and a short " +
          "rationale.\n\n" +
          `<resume>\n${resumeText}\n</resume>\n\n` +
          `<job_description>\n${jdText}\n</job_description>`,
      },
    ],
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return the expected structured tool call.");
  }
  return toolUse.input as ExtractionResult;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ScoreRequest = await req.json();
    if (!body.resumeText || !body.jdText) {
      return new Response(
        JSON.stringify({ error: "resumeText and jdText are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const extracted = await extractAndScore(body.resumeText, body.jdText);

    const { data: resumeEntity, error: resumeEntityError } = await supabase
      .from("entities")
      .insert({ entity_type: "resume" })
      .select()
      .single();
    if (resumeEntityError) throw resumeEntityError;

    const { data: jdEntity, error: jdEntityError } = await supabase
      .from("entities")
      .insert({ entity_type: "job_description" })
      .select()
      .single();
    if (jdEntityError) throw jdEntityError;

    const { error: resumeVersionError } = await supabase.from("entity_versions").insert({
      entity_id: resumeEntity.id,
      version_number: 1,
      is_current: true,
      data: {
        candidate_name: body.candidateName ?? null,
        raw_text: body.resumeText,
        file_path: body.resumeFilePath ?? null,
        extracted: {
          skills: extracted.skills,
          experience: extracted.experience,
          education: extracted.education,
        },
      },
    });
    if (resumeVersionError) throw resumeVersionError;

    const { error: jdVersionError } = await supabase.from("entity_versions").insert({
      entity_id: jdEntity.id,
      version_number: 1,
      is_current: true,
      data: { raw_text: body.jdText },
    });
    if (jdVersionError) throw jdVersionError;

    const { error: relationshipError } = await supabase.from("relationships_v2").insert({
      relationship_type: "scored_against",
      parent_id: resumeEntity.id,
      child_id: jdEntity.id,
      metadata: { fit_score: extracted.fit_score },
    });
    if (relationshipError) throw relationshipError;

    const { data: factTypes, error: factTypesError } = await supabase
      .from("fact_types")
      .select("id, key")
      .in("key", ["resume_jd_fit_score", "resume_jd_skill_overlap_count"]);
    if (factTypesError) throw factTypesError;

    const fitScoreFactTypeId = factTypes.find((f) => f.key === "resume_jd_fit_score")?.id;
    const overlapFactTypeId = factTypes.find((f) => f.key === "resume_jd_skill_overlap_count")?.id;
    if (!fitScoreFactTypeId || !overlapFactTypeId) {
      throw new Error(
        "resume_jd_fit_score / resume_jd_skill_overlap_count fact_types are missing — " +
          "has the resume_fit_scoring migration been applied?",
      );
    }

    const factMetadata = {
      reasoning: extracted.reasoning,
      matched_skills: extracted.matched_skills,
      missing_skills: extracted.missing_skills,
      model: "claude-opus-5",
    };

    const { error: factError } = await supabase.from("entity_facts").upsert(
      {
        entity_id: resumeEntity.id,
        fact_type_id: fitScoreFactTypeId,
        value: extracted.fit_score,
        metadata: factMetadata,
      },
      { onConflict: "entity_id,fact_type_id,dimension_id" },
    );
    if (factError) throw factError;

    const { error: overlapFactError } = await supabase.from("entity_facts").upsert(
      {
        entity_id: resumeEntity.id,
        fact_type_id: overlapFactTypeId,
        value: extracted.matched_skills.length,
        metadata: {},
      },
      { onConflict: "entity_id,fact_type_id,dimension_id" },
    );
    if (overlapFactError) throw overlapFactError;

    const { error: timeSeriesError } = await supabase.from("time_series_points").insert({
      entity_id: resumeEntity.id,
      fact_type_id: fitScoreFactTypeId,
      observed_at: new Date().toISOString(),
      data_payload: {
        fit_score: extracted.fit_score,
        reasoning: extracted.reasoning,
        matched_skills: extracted.matched_skills,
        missing_skills: extracted.missing_skills,
      },
      metadata: { model: "claude-opus-5" },
    });
    if (timeSeriesError) throw timeSeriesError;

    const result = {
      resumeEntityId: resumeEntity.id,
      jdEntityId: jdEntity.id,
      fitScore: extracted.fit_score,
      reasoning: extracted.reasoning,
      matchedSkills: extracted.matched_skills,
      missingSkills: extracted.missing_skills,
      extracted: {
        skills: extracted.skills,
        experience: extracted.experience,
        education: extracted.education,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("score-resume-fit failed:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
