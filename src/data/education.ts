/* ==========================================================================
   Education section content.

   Fields left as empty strings are simply not rendered — nothing invented
   ships. Fill the ones marked TODO and they appear automatically.
   ========================================================================== */

import { GRAPH_STATS } from './graphStats';

export const EDUCATION = {
  degree: 'B.Sc. Computer Science',
  school: 'Mount Royal University',
  concentration: 'Concentration in Mathematics',
  /** Sits on the concentration line rather than in a stat row of its own. */
  gpa: '3.82',

  /** Counts come from the generated stats so they stay in sync with what
      actually ships in `graph.json`. */
  blurb:
    'This section offers an interactive graph like UI to help people understand ' +
    'various topics in computer science. I did this to help give a visual ' +
    'intuition to how all these ideas connect together. ' +
    `${GRAPH_STATS.notes.toLocaleString()} notes across ${GRAPH_STATS.courses} courses, ` +
    `with ${GRAPH_STATS.links.toLocaleString()} links between them.`,

  /** The call to action through to /graph. */
  cta: {
    label: 'Start Learning',
  },
} as const;
