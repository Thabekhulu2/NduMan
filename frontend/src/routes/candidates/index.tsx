/**
 * Candidate History Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { UIEngine } from '@/engine';
import candidateHistoryPage from '@/pages/candidate-history.json';
import type { PageDefinition } from '@/engine/types';

export const Route = createFileRoute('/candidates/')({
  component: CandidateHistoryPage,
});

function CandidateHistoryPage() {
  return <UIEngine page={candidateHistoryPage as PageDefinition} />;
}
