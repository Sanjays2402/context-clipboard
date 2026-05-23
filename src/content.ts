/// <reference types="chrome" />
// Captures copy events (text AND images), and renders an in-page command palette
// that the popup keyboard shortcut can summon via the background.

const api: typeof chrome =
  // @ts-expect-error firefox global
  (typeof browser !== "undefined" ? browser : chrome) as typeof chrome;

document.addEventListener(
  "copy",
  () => {
    setTimeout(captureCopy, 50);
  },
  true,
);

async function captureCopy() {
  const sel = window.getSelection();
  const text = sel ? sel.toString() : "";
  const nearbyText = getNearbyText(sel);

  // Try to detect an image copy via the active element / selection.
  const imgSrc = getSelectedImageSrc(sel);

  if (imgSrc) {
    try {
      const dataUrl = await toDataUrl(imgSrc);
      await api.runtime.sendMessage({
        type: "cc-copy",
        kind: "image",
        content: dataUrl,
        mime: guessMime(dataUrl),
        nearbyText: imgSrc,
      });
    } catch (e) {
      console.debug("[context-clipboard] image copy failed", e);
    }
    return;
  }

  if (!text || text.length < 1) return;

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
}

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
    const block = el.closest("p, li, article, section, blockquote, td, div");
    const txt = (block?.textContent || "").replace(/\s+/g, " ").trim();
    return txt.slice(0, 500);
  } catch {
    return undefined;
  }
}

function getSelectedImageSrc(sel: Selection | null): string | undefined {
  if (!sel || sel.rangeCount === 0) return undefined;
  const range = sel.getRangeAt(0);
  const frag = range.cloneContents();
  const img = frag.querySelector("img");
  if (img && img.src) return img.src;
  // Also handle focused image element (e.g., right-click image, Cmd+C)
  const active = document.activeElement as HTMLElement | null;
  if (active && active.tagName === "IMG") return (active as HTMLImageElement).src;
  return undefined;
}

async function toDataUrl(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const res = await fetch(url, { mode: "cors" });
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function guessMime(dataUrl: string): string {
  const m = /^data:([^;]+);/.exec(dataUrl);
  return m ? m[1] : "image/png";
}

// In-page command palette ---------------------------------------------------
//
// When background tells us to "open-palette", inject a self-contained overlay
// with search + recent clips. Avoids cross-origin issues and feels native.

interface PaletteClip {
  id: string;
  kind: "text" | "image" | "link";
  content: string;
  preview?: string;
  source?: { url?: string; title?: string };
}

api.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  if (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: string }).type === "cc-open-palette"
  ) {
    openPalette((msg as { clips: PaletteClip[] }).clips || []);
    sendResponse({ ok: true });
  }
  return false;
});

let paletteRoot: HTMLElement | null = null;
let suggestionRoot: HTMLElement | null = null;
let lastFocusedField: HTMLElement | null = null;
let lastFieldKey: string | null = null;

// Track "copy from a field" so we can later record the source field key.
let lastCopiedField: { host: string; fieldKey: string; preview: string } | null =
  null;

function fieldKeyFor(el: HTMLElement): string | null {
  if (!isEditable(el)) return null;
  // Prefer stable, intent-rich attributes.
  const tag = el.tagName.toLowerCase();
  const id = el.id || "";
  const name = (el as HTMLInputElement).name || "";
  const type = (el as HTMLInputElement).type || "";
  const ac = el.getAttribute("autocomplete") || "";
  const aria = el.getAttribute("aria-label") || "";
  const placeholder = (el as HTMLInputElement).placeholder || "";
  // First non-empty signal wins.
  const sig =
    ac || name || id || aria || placeholder || `${tag}:${type}` || tag;
  return `${tag}|${sig}`.slice(0, 200);
}

function isEditable(el: Element | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA") return !(el as HTMLTextAreaElement).disabled && !(el as HTMLTextAreaElement).readOnly;
  if (tag === "INPUT") {
    const t = ((el as HTMLInputElement).type || "text").toLowerCase();
    const editable = ["text", "search", "url", "email", "tel", "password", "number", ""].includes(t);
    return editable && !(el as HTMLInputElement).disabled && !(el as HTMLInputElement).readOnly;
  }
  return false;
}

function hostNow(): string {
  try {
    return new URL(location.href).hostname.replace(/^www\./, "");
  } catch {
    return location.hostname;
  }
}

function getFieldValue(el: HTMLElement): string {
  if (el.isContentEditable) return (el.textContent || "").trim();
  const v = (el as HTMLInputElement | HTMLTextAreaElement).value;
  return (v || "").trim();
}

function setFieldValue(el: HTMLElement, value: string) {
  if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const proto =
    el.tagName === "TEXTAREA"
      ? Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          "value",
        )
      : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// On copy: remember the source field so we can record after paste.
document.addEventListener(
  "copy",
  () => {
    const el = document.activeElement as HTMLElement | null;
    if (el && isEditable(el)) {
      const key = fieldKeyFor(el);
      if (key) {
        lastCopiedField = {
          host: hostNow(),
          fieldKey: key,
          preview: getFieldValue(el).slice(0, 200),
        };
      }
    }
  },
  true,
);

// On paste: if we have a recent "clip captured" id we can correlate; the
// background will create the clip from the copy event, and on the next paste
// into a field we record (host, fieldKey) → clipId mapping.
document.addEventListener(
  "paste",
  async (e) => {
    const target = e.target as HTMLElement | null;
    if (!target || !isEditable(target)) return;
    const key = fieldKeyFor(target);
    if (!key) return;
    const pasted = e.clipboardData?.getData("text/plain") || "";
    if (!pasted) return;
    // Ask background which clip matches this text (the most recent matching hash).
    try {
      const resp = await new Promise<{
        ok: boolean;
        suggestion?: { clipId: string; preview?: string } | null;
        clipId?: string;
      }>((resolve) => {
        api.runtime.sendMessage(
          {
            type: "cc-rpc",
            action: "findClipByContent",
            payload: { content: pasted },
          },
          (r) => resolve(r),
        );
      });
      const clipId = resp?.clipId;
      if (!clipId) return;
      await new Promise<void>((resolve) => {
        api.runtime.sendMessage(
          {
            type: "cc-rpc",
            action: "recordFieldPaste",
            payload: {
              host: hostNow(),
              fieldKey: key,
              clipId,
              preview: pasted.slice(0, 200),
            },
          },
          () => resolve(),
        );
      });
    } catch (_e) {
      // background may be sleeping; harmless
    }
  },
  true,
);

// On focus: query background for a suggestion and float a chip near the field.
document.addEventListener(
  "focusin",
  async (e) => {
    const target = e.target as HTMLElement | null;
    if (!target || !isEditable(target)) return;
    const key = fieldKeyFor(target);
    if (!key) return;
    lastFocusedField = target;
    lastFieldKey = key;
    // Don't suggest into fields that already have a value (avoid spam).
    if (getFieldValue(target).length > 0) return closeSuggestion();
    try {
      const resp = await new Promise<{
        ok: boolean;
        suggestion?: {
          clipId: string;
          kind: string;
          content: string;
          preview: string;
          count: number;
        } | null;
      }>((resolve) => {
        api.runtime.sendMessage(
          {
            type: "cc-rpc",
            action: "getFieldSuggestion",
            payload: { host: hostNow(), fieldKey: key },
          },
          (r) => resolve(r),
        );
      });
      if (!resp?.suggestion) return closeSuggestion();
      showSuggestion(target, resp.suggestion);
    } catch {
      // ignore
    }
  },
  true,
);

document.addEventListener(
  "focusout",
  (e) => {
    if (e.target === lastFocusedField) {
      setTimeout(() => {
        // Allow click on chip before it disappears.
        if (document.activeElement !== suggestionRoot) closeSuggestion();
      }, 200);
    }
  },
  true,
);

function showSuggestion(
  field: HTMLElement,
  s: { clipId: string; kind: string; content: string; preview: string; count: number },
) {
  closeSuggestion();
  const root = document.createElement("div");
  root.id = "__cc_field_suggestion__";
  root.attachShadow({ mode: "open" });
  const rect = field.getBoundingClientRect();
  const top = Math.min(
    window.innerHeight - 50,
    window.scrollY + rect.bottom + 6,
  );
  const left = window.scrollX + rect.left;
  const css = `
    :host { all: initial; }
    .chip { position: absolute; top: ${top}px; left: ${left}px; z-index: 2147483645; display:flex; align-items:center; gap:8px; padding:6px 8px 6px 12px; background: rgba(20,20,26,0.85); backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%); color:#f4f4f7; border:1px solid rgba(255,255,255,0.12); border-radius: 999px; font: 12px/1 -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif; box-shadow: 0 8px 24px rgba(0,0,0,0.45); cursor: pointer; max-width: 320px; }
    .dot { width:6px; height:6px; border-radius:50%; background:#ffc933; box-shadow: 0 0 6px rgba(255,201,51,0.7); flex:0 0 6px; }
    .label { color:#b8b8c2; font-weight:500; }
    .preview { color:#f4f4f7; max-width: 180px; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; font-weight:500; }
    .actions { display:flex; gap:2px; margin-left: 4px; }
    button { background:transparent; border:none; color:#b8b8c2; padding:4px 8px; border-radius: 999px; font-size:11px; cursor:pointer; font-family: inherit; font-weight:600; }
    button:hover { background: rgba(255,255,255,0.08); color:#fff; }
    button.primary { background: rgba(255,201,51,0.2); color:#ffc933; }
    button.primary:hover { background: rgba(255,201,51,0.32); }
  `;
  const html = `
    <div class="chip" role="button" tabindex="0">
      <span class="dot"></span>
      <span class="label">Paste</span>
      <span class="preview">${escapeHtml(s.preview).slice(0, 60)}</span>
      <div class="actions">
        <button class="primary" data-act="paste">⏎ Paste</button>
        <button data-act="dismiss">×</button>
      </div>
    </div>
  `;
  const style = document.createElement("style");
  style.textContent = css;
  root.shadowRoot!.appendChild(style);
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  root.shadowRoot!.appendChild(wrap);
  document.documentElement.appendChild(root);
  suggestionRoot = root;

  const chip = root.shadowRoot!.querySelector(".chip") as HTMLElement;
  chip.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).dataset.act;
    if (t === "dismiss") {
      e.stopPropagation();
      closeSuggestion();
      return;
    }
    // paste
    if (lastFocusedField) {
      if (s.kind === "text" || s.kind === "link") {
        setFieldValue(lastFocusedField, s.content);
        lastFocusedField.focus();
      } else {
        // For images we can't insert into a text field; copy to clipboard instead.
        navigator.clipboard.writeText(s.content).catch(() => {});
      }
      // Record this confirmed paste so the mapping gets stronger.
      if (lastFieldKey) {
        api.runtime.sendMessage({
          type: "cc-rpc",
          action: "recordFieldPaste",
          payload: {
            host: hostNow(),
            fieldKey: lastFieldKey,
            clipId: s.clipId,
            preview: s.preview,
          },
        });
      }
    }
    closeSuggestion();
  });

  // Keyboard: Tab/Enter focuses chip, ⏎ pastes
  document.addEventListener("keydown", suggestionKeydown, true);
}

function suggestionKeydown(e: KeyboardEvent) {
  if (!suggestionRoot) return;
  if (e.key === "Escape") {
    closeSuggestion();
  } else if (
    e.key === "Enter" &&
    (e.altKey || e.metaKey) // ⌥⏎ / ⌘⏎ to paste — avoid hijacking forms
  ) {
    e.preventDefault();
    const primary = suggestionRoot.shadowRoot?.querySelector(
      "button.primary",
    ) as HTMLButtonElement | null;
    primary?.click();
  }
}

function closeSuggestion() {
  document.removeEventListener("keydown", suggestionKeydown, true);
  suggestionRoot?.remove();
  suggestionRoot = null;
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c] as string,
  );
}

function openPalette(clips: PaletteClip[]) {
  closePalette();
  const root = document.createElement("div");
  root.id = "__context_clipboard_palette__";
  root.attachShadow({ mode: "open" });
  const css = `
    :host { all: initial; }
    .scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 2147483646; display:flex; align-items:flex-start; justify-content:center; padding-top: 12vh; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .box { width: 560px; max-width: 92vw; background: #161a22; color:#e6e8ef; border-radius: 12px; box-shadow: 0 18px 60px rgba(0,0,0,0.55); overflow: hidden; border: 1px solid #232936; }
    input { width:100%; background:#0f1115; color:#e6e8ef; border:none; border-bottom:1px solid #232936; padding:14px 16px; font-size:15px; outline:none; }
    .list { max-height: 50vh; overflow-y: auto; }
    .row { padding: 10px 14px; border-bottom: 1px solid #232936; cursor: pointer; display:flex; gap:10px; align-items:flex-start; }
    .row:hover, .row.active { background: #1c212c; }
    .row.active { box-shadow: inset 3px 0 0 #f5b400; }
    .thumb { width: 36px; height: 36px; flex:0 0 36px; border-radius:4px; background:#0f1115; display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:14px; }
    .thumb img { width:100%; height:100%; object-fit:cover; }
    .body { flex:1; min-width:0; }
    .preview { font-size: 13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .meta { margin-top:2px; font-size: 11px; color:#8a93a6; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .empty { padding: 24px; text-align:center; color:#8a93a6; font-size: 13px; }
    .hint { font-size: 10px; padding: 6px 12px; background:#0f1115; color:#8a93a6; text-align:center; border-top:1px solid #232936; }
  `;
  const html = `
    <div class="scrim">
      <div class="box" role="dialog">
        <input type="search" placeholder="Search Context Clipboard…" autocomplete="off" />
        <div class="list"></div>
        <div class="hint">↑↓ navigate · ⏎ paste · Esc close</div>
      </div>
    </div>
  `;
  const style = document.createElement("style");
  style.textContent = css;
  root.shadowRoot!.appendChild(style);
  const wrap = document.createElement("div");
  wrap.innerHTML = html;
  root.shadowRoot!.appendChild(wrap);
  document.documentElement.appendChild(root);
  paletteRoot = root;

  const sr = root.shadowRoot!;
  const input = sr.querySelector("input") as HTMLInputElement;
  const list = sr.querySelector(".list") as HTMLElement;
  const scrim = sr.querySelector(".scrim") as HTMLElement;
  let active = 0;
  let filtered = clips.slice();

  function host(u?: string) {
    if (!u) return "";
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return u;
    }
  }

  function esc(s: string) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  }

  function render() {
    if (filtered.length === 0) {
      list.innerHTML = `<div class="empty">No clips match.</div>`;
      return;
    }
    list.innerHTML = filtered
      .map((c, i) => {
        const thumb =
          c.kind === "image"
            ? `<div class="thumb"><img src="${c.content}" /></div>`
            : `<div class="thumb">${c.kind === "link" ? "🔗" : "📝"}</div>`;
        const preview = c.kind === "image" ? c.preview || "Image" : c.preview || c.content;
        const src = [host(c.source?.url), c.source?.title].filter(Boolean).join(" · ");
        return `<div class="row ${i === active ? "active" : ""}" data-i="${i}">${thumb}<div class="body"><div class="preview">${esc(preview.slice(0, 140))}</div><div class="meta">${esc(src || "")}</div></div></div>`;
      })
      .join("");
  }

  function filter() {
    const q = input.value.toLowerCase().trim();
    filtered = clips.filter((c) => {
      if (!q) return true;
      const hay = `${c.preview || c.content} ${c.source?.title || ""} ${c.source?.url || ""}`.toLowerCase();
      return hay.includes(q);
    });
    active = 0;
    render();
  }

  async function pick(c: PaletteClip) {
    try {
      if (c.kind === "image") {
        const res = await fetch(c.content);
        const blob = await res.blob();
        const Item = (window as unknown as { ClipboardItem: new (parts: Record<string, Blob>) => unknown }).ClipboardItem;
        const clip = navigator.clipboard as unknown as { write: (items: unknown[]) => Promise<void> };
        await clip.write([new Item({ [blob.type]: blob })]);
      } else {
        await navigator.clipboard.writeText(c.content);
      }
    } catch (e) {
      console.error("[context-clipboard] paste failed", e);
    }
    closePalette();
  }

  input.addEventListener("input", filter);
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(filtered.length - 1, active + 1);
      render();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
      render();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[active];
      if (c) pick(c);
    } else if (e.key === "Escape") {
      closePalette();
    }
  });
  list.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest(".row") as HTMLElement | null;
    if (!row) return;
    const i = Number(row.dataset.i);
    const c = filtered[i];
    if (c) pick(c);
  });
  scrim.addEventListener("click", (e) => {
    if (e.target === scrim) closePalette();
  });

  setTimeout(() => input.focus(), 0);
  render();
}

function closePalette() {
  paletteRoot?.remove();
  paletteRoot = null;
}
