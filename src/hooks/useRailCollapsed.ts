import { useCallback, useEffect, useState } from 'react';

const RAIL_STORAGE_KEY = 'rail-collapsed';

/**
 * The nav rail's collapsed state, shared by every page that renders the shell.
 *
 * Held here rather than in `App` because the graph route mounts the same rail
 * from a different tree: leaving the state in one page meant collapsing the
 * rail on the portfolio and finding it expanded again on `/graph`, which is
 * exactly the seam the shared shell exists to remove. localStorage is what
 * carries it across the full page load between the two.
 */
export function useRailCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(RAIL_STORAGE_KEY) === 'true',
  );

  useEffect(() => {
    localStorage.setItem(RAIL_STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  return [collapsed, useCallback(() => setCollapsed((c) => !c), [])];
}
