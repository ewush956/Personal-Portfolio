import './GraphLoading.css';

/**
 * Suspense fallback for the graph route.
 *
 * Themed from the token contract rather than a generic spinner, so the wait
 * still looks like the site. In practice most visitors never see this: the
 * Education CTA prefetches the chunk on hover.
 */
export function GraphLoading() {
  return (
    <div className="graph-loading" role="status" aria-live="polite">
      <div className="graph-loading__orbit" aria-hidden="true">
        <span className="graph-loading__core" />
        <span className="graph-loading__node graph-loading__node--1" />
        <span className="graph-loading__node graph-loading__node--2" />
        <span className="graph-loading__node graph-loading__node--3" />
      </div>
      <p>Loading the vault…</p>
    </div>
  );
}
