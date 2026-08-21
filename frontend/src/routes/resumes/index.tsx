/**
 * Resume Scoring Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { UIEngine } from '@/engine';
import resumeScorecardPage from '@/pages/resume-scorecard.json';
import type { PageDefinition } from '@/engine/types';

export const Route = createFileRoute('/resumes/')({
  component: ResumeScoringPage,
});

function ResumeScoringPage() {
  return <UIEngine page={resumeScorecardPage as PageDefinition} />;
}
