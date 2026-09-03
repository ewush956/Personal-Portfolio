/* Layout constants shared between the page and the sheet.
   Kept out of GraphPage.tsx on purpose: NotePanel is lazily imported to keep
   the markdown and KaTeX stack out of the main chunk, so it must not import
   from the module that loads it. */

/**
 * How much of the viewport the note sheet covers on a phone when open.
 *
 * Three things have to agree on it: this sheet's own resting height and drag
 * snap point, the inset the graph camera and the labels are kept clear of, and
 * `height: 70vh` in NotePanel.css — CSS can't read this, so the rule there
 * names it back. Raise one without the others and either the sheet snaps to a
 * height it doesn't rest at, or the graph frames itself behind the sheet.
 */
export const SHEET_OPEN = 0.7;
