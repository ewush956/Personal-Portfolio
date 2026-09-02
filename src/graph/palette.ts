import type { GraphPalette, TopicMeta } from './types';

/**
 * Read the graph palette off the live CSS custom properties.
 *
 * A <canvas> can't resolve var(--token) itself, so colors have to be pulled out
 * of the cascade as strings. This uses the same probe-element trick as
 * getThemeAssetUrls() in ../themes/preloadTheme.ts, which keeps the canvas
 * driven by the theme token contract instead of a second hardcoded palette.
 *
 * Re-run this whenever the theme changes.
 */
export function readPalette(topics: TopicMeta[]): GraphPalette {
  const cs = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    cs.getPropertyValue(name).trim() || fallback;

  const topic: Record<string, string> = {};
  topics.forEach((t, i) => {
    topic[t.id] = get(`--graph-topic-${i + 1}`, '#888888');
  });

  return {
    bg: get('--graph-bg', '#0a0a0a'),
    link: get('--graph-link', 'rgba(255,255,255,0.12)'),
    linkHighlight: get('--graph-link-highlight', '#ffffff'),
    label: get('--graph-label', '#e8e8e8'),
    nodeIndex: get('--graph-node-index', '#ffffff'),
    nodeCourse: get('--graph-node-course', '#cccccc'),
    nodeDim: get('--graph-node-dim', 'rgba(255,255,255,0.25)'),
    topic,
  };
}
