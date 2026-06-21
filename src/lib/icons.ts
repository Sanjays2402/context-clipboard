/** Lightweight inline SVG icons. Phosphor-inspired, stroke-based.
 *  All icons use `currentColor` so they inherit text color from CSS.
 */

const SIZE = 18;

function svg(path: string, opts: { size?: number; fill?: boolean } = {}): string {
  const s = opts.size ?? SIZE;
  const stroke = opts.fill ? "none" : "currentColor";
  const fill = opts.fill ? "currentColor" : "none";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

export const icons = {
  // Filter bar
  all: () =>
    svg(
      `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`,
    ),
  text: () =>
    svg(
      `<path d="M4 6h16M4 12h12M4 18h8"/>`,
    ),
  image: () =>
    svg(
      `<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>`,
    ),
  link: () =>
    svg(
      `<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.5 1.5"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1.5-1.5"/>`,
    ),
  pin: () =>
    svg(
      `<path d="M12 17v5"/><path d="M9 11 5.5 14.5l4 1.5 5-5"/><path d="m15 3-3 3 6 6 3-3z"/>`,
    ),
  pinFilled: () =>
    svg(
      `<path d="M12 17v5"/><path d="M9 11 5.5 14.5l4 1.5 5-5"/><path d="m15 3-3 3 6 6 3-3z"/>`,
      { fill: true },
    ),
  // Toolbar
  plus: () => svg(`<path d="M12 5v14M5 12h14"/>`),
  settings: () =>
    svg(
      `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
    ),
  // Actions
  copy: () =>
    svg(
      `<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>`,
    ),
  clock: () =>
    svg(
      `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>`,
    ),
  trash: () =>
    svg(
      `<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="m5 6 1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-14"/>`,
    ),
  back: () => svg(`<path d="m15 18-6-6 6-6"/>`),
  chevronUp: () => svg(`<path d="m18 15-6-6-6 6"/>`),
  chevronDown: () => svg(`<path d="m6 9 6 6 6-6"/>`),
  close: () => svg(`<path d="M18 6 6 18M6 6l12 12"/>`),
  eye: () =>
    svg(
      `<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>`,
    ),
  shield: () =>
    svg(
      `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>`,
    ),
  shieldOff: () =>
    svg(
      `<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M3 3l18 18"/>`,
    ),
  search: () =>
    svg(`<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>`),
  refresh: () =>
    svg(
      `<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/>`,
    ),
  tag: () =>
    svg(
      `<path d="M20.6 13.4 12 22 2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>`,
    ),
  check: () => svg(`<path d="M20 6 9 17l-5-5"/>`),
  bookmark: () =>
    svg(
      `<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>`,
    ),
  bookmarkFilled: () =>
    svg(
      `<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>`,
      { fill: true },
    ),
  noteText: () =>
    svg(
      `<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 13h6M9 17h6"/>`,
    ),
  // Clipboard with checkmark — quick-capture button. Distinct silhouette
  // from `copy` (which is two pages) so users don't confuse "paste a new
  // clip in" with "copy this clip to clipboard".
  clipboard: () =>
    svg(
      `<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="m9 14 2 2 4-4"/>`,
    ),
  // Eraser — used by the "scrub origin" affordance to telegraph
  // "remove the source metadata, keep the content".
  eraser: () =>
    svg(
      `<path d="m3 21 9-9 9 9"/><path d="m7 17 10-10 5 5L12 22z"/><path d="M14 4 20 10"/>`,
    ),
  // Globe — used by the "Forget host" right-click menu entry so the
  // intent is unambiguous (the action is about origin host, not content).
  globe: () =>
    svg(
      `<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18"/><path d="M12 3a14 14 0 0 0 0 18"/>`,
    ),
  imageGeneric: () =>
    svg(
      `<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>`,
    ),
  linkGeneric: () =>
    svg(
      `<path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 1 0-5-5l-1.5 1.5"/><path d="M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 1 0 5 5l1.5-1.5"/>`,
    ),
};

export function clipKindIcon(kind: "text" | "image" | "link"): string {
  if (kind === "image") return icons.imageGeneric();
  if (kind === "link") return icons.linkGeneric();
  return icons.noteText();
}
