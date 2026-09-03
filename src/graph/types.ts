export type NodeKind = 'index' | 'course' | 'note';

export interface GraphNode {
  id: number;
  title: string;
  slug: string;
  /** The vault directory the note sits in, or null at the vault root. Only the
      folder, never the full path: the path spells out course folders, which do
      not leave the build. Read for the few notes no course claims — see
      `courseLabel.ts`. */
  folder: string | null;
  kind: NodeKind;
  /** Primary topic bucket — drives the node's colour only. Null for index/course. */
  topic: string | null;
  /** Every bucket this node belongs to. The filter shows it if any is enabled. */
  topics: string[];
  year: number | null;
  degree: number;
  /** The course this node belongs to, as a node id — what the reading panel
      names under the title. A course is its own; the index has none, and nor do
      the few notes no course draws on. Decided at build time, off the vault:
      see the course-attribution section of `scripts/build-graph.mjs`. */
  course: number | null;
  x: number;
  y: number;
}

export interface TopicMeta {
  id: string;
  label: string;
}

export interface GraphData {
  generatedAt: string;
  /** Cache key for per-note fetches; changes on every sync. */
  buildId: string;
  indexId: number;
  topics: TopicMeta[];
  nodes: GraphNode[];
  /** Flat source/target index pairs: [s0, t0, s1, t1, …]. */
  edges: number[];
}

/** Resolved colors for one theme, read off the live CSS custom properties. */
export interface GraphPalette {
  bg: string;
  link: string;
  linkHighlight: string;
  label: string;
  nodeIndex: string;
  nodeCourse: string;
  nodeDim: string;
  /** Topic bucket id → color. */
  topic: Record<string, string>;
}

/**
 * Compressed sparse row adjacency. `offsets` has length n+1; the neighbours of
 * node i are `neighbours[offsets[i] … offsets[i+1]]`. Built once at load, in
 * O(E), rather than shipped — it would add ~100 KB to the payload for work the
 * browser does in under a millisecond.
 */
export interface Adjacency {
  offsets: Int32Array;
  neighbours: Int32Array;
}

export function buildAdjacency(nodeCount: number, edges: number[]): Adjacency {
  const counts = new Int32Array(nodeCount);
  for (let i = 0; i < edges.length; i++) counts[edges[i]]++;

  const offsets = new Int32Array(nodeCount + 1);
  for (let i = 0; i < nodeCount; i++) offsets[i + 1] = offsets[i] + counts[i];

  const cursor = offsets.slice(0, nodeCount);
  const neighbours = new Int32Array(edges.length);
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i];
    const b = edges[i + 1];
    neighbours[cursor[a]++] = b;
    neighbours[cursor[b]++] = a;
  }

  return { offsets, neighbours };
}
