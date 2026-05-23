/// <reference types="chrome" />
// Listens for copy events on the page and forwards them to the background
// service worker with surrounding context.

const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

document.addEventListener("copy", () => {
  // Defer slightly so the system clipboard has settled.
  setTimeout(async () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    if (!text || text.length < 1) return;

    const nearbyText = getNearbyText(sel);

    try {
      await api.runtime.sendMessage({
        type: "cc-copy",
        kind: "text",
        content: text,
        nearbyText,
      });
    } catch (_e) {
      // background may not be ready; safe to drop
    }
  }, 50);
});

function getNearbyText(sel: Selection | null): string | undefined {
  if (!sel || sel.rangeCount === 0) return undefined;
  try {
    const range = sel.getRangeAt(0);
    const container = range.commonAncestorContainer;
    const el =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as HTMLElement)
        : container.parentElement;
    if (!el) return undefined;
    // Grab the closest block-level ancestor for context.
    const block = el.closest("p, li, article, section, blockquote, td, div");
    const txt = (block?.textContent || "").replace(/\s+/g, " ").trim();
    return txt.slice(0, 500);
  } catch {
    return undefined;
  }
}
