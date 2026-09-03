import { Suspense, lazy } from 'react';
import { GraphLoading } from './GraphLoading';

/**
 * The lazy boundary for the whole graph feature.
 *
 * Lives here rather than in main.tsx so the entry point exports nothing but the
 * mount call, and so the split point is next to the thing being split.
 */
const GraphPage = lazy(() => import('./GraphPage'));

export function GraphRoute() {
  return (
    <Suspense fallback={<GraphLoading />}>
      <GraphPage />
    </Suspense>
  );
}
