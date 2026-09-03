import { useEffect, useState } from 'react';
import type { Ref } from 'react';
import type { GraphNode, TopicMeta } from './types';

interface GraphLegendProps {
  topics: TopicMeta[];
  nodes: GraphNode[];
  enabled: Set<string>;
  showCourses: boolean;
  onToggle: (id: string) => void;
  onToggleCourses: () => void;
  onAll: (on: boolean) => void;
  /** Whether a note is open. On a phone the list folds away behind the sheet
      and comes back when the sheet does. */
  reading: boolean;
  /** So the page can measure what this covers. On a phone it is a full-width
      bar along the bottom, and with no note open it is the only thing between
      the graph and the bottom edge — so the camera has to frame above it. */
  boxRef?: Ref<HTMLElement>;
}

/**
 * Legend and filter, in one control.
 *
 * They belong together: the legend already explains what each colour means, so
 * making the swatches themselves the checkboxes avoids a second list saying the
 * same words twice.
 *
 * Courses sit above the rule as their own row — they're structure rather than a
 * topic, and turning them off is a different kind of decluttering than dropping
 * a subject. The index has no row at all: it's the way back in, so it always
 * stays on screen.
 */
export function GraphLegend({
  topics,
  nodes,
  enabled,
  showCourses,
  onToggle,
  onToggleCourses,
  onAll,
  reading,
  boxRef,
}: GraphLegendProps) {
  // Counts every node the filter would keep, courses included — a node with
  // several topics is counted under each, which is what the filter does too.
  const counts = new Map<string, number>();
  for (const n of nodes) {
    for (const t of n.topics) counts.set(t, (counts.get(t) ?? 0) + 1);
  }

  // On a desktop the list is always open and the toggle is inert — there it
  // costs nothing. On a phone it is a full-width bar along the bottom, so it
  // folds to its header while a note is open and the sheet is over the graph,
  // and opens again when the note is closed. Closing the note is a request to
  // look at the graph, and the filter is the only control that changes what the
  // graph shows — arriving back at a folded bar meant tapping twice to get at
  // it, on the one screen where there is nothing else competing for the space.
  // The header stays a manual toggle either way; this only sets the default
  // each time the reading state flips.
  const [collapsed, setCollapsed] = useState(false);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    setCollapsed(narrow && reading);
  }, [narrow, reading]);

  const courseCount = nodes.filter((n) => n.kind === 'course').length;
  // All/None governs the topic rows only. Courses is a structural toggle, and
  // bundling it in meant "None, then tick one topic" silently dropped that
  // topic's courses — while leaving it out makes "None" a genuinely useful
  // state: the index and the course ring on their own, the degree's skeleton.
  const allOn = topics.every((t) => enabled.has(t.id));

  return (
    <aside
      ref={boxRef}
      className="graph-legend"
      aria-label="Topics"
      data-collapsed={collapsed}
    >
      <div className="graph-legend__head">
        {narrow ? (
          <button
            type="button"
            className="graph-legend__toggle"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
          >
            Topics <span aria-hidden="true">{collapsed ? '▴' : '▾'}</span>
          </button>
        ) : (
          <span>Topics</span>
        )}
        <button type="button" className="graph-legend__all" onClick={() => onAll(!allOn)}>
          {allOn ? 'None' : 'All'}
        </button>
      </div>

      <ul className="graph-legend__list">
        <li className="graph-legend__structural">
          <label className={`graph-legend__item${showCourses ? '' : ' is-off'}`}>
            <input type="checkbox" checked={showCourses} onChange={onToggleCourses} />
            <i
              style={{
                color: 'var(--graph-node-course)',
                background: showCourses ? 'var(--graph-node-course)' : 'transparent',
              }}
              aria-hidden="true"
            />
            <span className="graph-legend__label">Courses</span>
            <span className="graph-legend__count">{courseCount}</span>
          </label>
        </li>

        {topics.map((t, i) => {
          const on = enabled.has(t.id);
          return (
            <li key={t.id}>
              <label className={`graph-legend__item${on ? '' : ' is-off'}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => onToggle(t.id)}
                />
                <i
                  style={{
                    color: `var(--graph-topic-${i + 1})`,
                    background: on ? `var(--graph-topic-${i + 1})` : 'transparent',
                  }}
                  aria-hidden="true"
                />
                <span className="graph-legend__label">{t.label}</span>
                <span className="graph-legend__count">{counts.get(t.id) ?? 0}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
