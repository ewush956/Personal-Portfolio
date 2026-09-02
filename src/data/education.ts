/* ==========================================================================
   Education section content.

   Fields left as empty strings are simply not rendered — nothing invented
   ships. Fill the ones marked TODO and they appear automatically.
   ========================================================================== */

export interface Credential {
  label: string;
  value: string;
}

export const EDUCATION = {
  degree: 'B.Sc. Computer Science',
  school: 'Mount Royal University',
  concentration: 'Concentration in Mathematics',
  focus: 'Machine Learning',

  /** TODO: e.g. 'Class of 2025' or 'Expected 2026'. Hidden while empty. */
  timeframe: '',

  /**
   * Extracurriculars read as prose here rather than as a separate list — one
   * bullet under a heading made a single item look like an afterthought.
   * TODO: the Launchpad sentence can carry your role or the outcome once
   * there's something specific to say.
   */
  blurb:
    'Four years of computer science with a mathematics concentration, weighted ' +
    'toward machine learning, with a run at the Launchpad Health Tech Challenge ' +
    'along the way. Underneath all of it: a habit of writing everything down and ' +
    'linking it together.',

  credentials: [
    { label: 'GPA', value: '3.82' },
    { label: 'Standing', value: "President's Honour Roll" },
  ] satisfies Credential[],

  /** The call to action through to /graph. */
  cta: {
    label: 'Step inside four years of thinking',
    /** Sits under the label; the counts are appended after it. */
    lead: 'Every note I took, every link I drew between them —',
  },
} as const;
