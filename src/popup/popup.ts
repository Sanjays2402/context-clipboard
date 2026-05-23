import { listClips, deleteClip, togglePin, clearAll } from "../lib/db";
import type { ClipItem, ClipKind } from "../lib/types";

const listEl = document.getElementById("list")!;
const searchEl = document.getElementById("search") as HTMLInputElement;
const countEl = document.getElementById("count")!;
const clearBtn = document.getElementById("clear")!;
const pinnedToggle = document.getElementById("pinned-toggle")!;
const filterBtns = document.querySelectorAll<HTMLButtonElement>(
  ".filters button[data-kind]",
);

let currentKind: ClipKind | "all" = "all";
let pinnedOnly = false;

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function hostFrom(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

function renderClip(c: ClipItem): string {
  const thumb =
    c.kind === "image"
      ? `<div class="thumb"><img src="${c.content}" alt="" /></div>`
      : `<div class="thumb">${c.kind === "link" ? "🔗" : "📝"}</div>`;
  const src = [hostFrom(c.source.url), c.source.title]
    .filter(Boolean)
    .join(" · ");
  const previewText =
    c.kind === "image" ? c.preview || "Image" : c.preview || c.content;
  return `
    <div class="clip ${c.pinned ? "pinned" : ""}" data-id="${c.id}">
      ${thumb}
      <div class="body">
        <div class="preview">${escapeHtml(previewText.slice(0, 140))}</div>
        <div class="meta">
          <span class="src" title="${escapeHtml(c.source.url || "")}">${escapeHtml(src || "—")}</span>
          <span>· ${timeAgo(c.createdAt)} ago</span>
        </div>
      </div>
      <div class="actions">
        <button class="pin" data-act="pin" title="Pin">📌</button>
        <button class="copy" data-act="copy" title="Copy">⎘</button>
        <button class="del" data-act="del" title="Delete">✕</button>
      </div>
    </div>
  `;
}

async function render(): Promise<void> {
  const clips = await listClips({
    q: searchEl.value,
    kind: currentKind,
    pinnedOnly,
    limit: 200,
  });
  if (clips.length === 0) {
    listEl.innerHTML = `<div class="empty">No clips yet.<br/>Copy something or use the right-click menu.</div>`;
  } else {
    listEl.innerHTML = clips.map(renderClip).join("");
  }
  countEl.textContent = `${clips.length} clip${clips.length === 1 ? "" : "s"}`;
}

function toast(msg: string) {
  let t = document.querySelector<HTMLDivElement>(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t!.classList.remove("show"), 1200);
}

async function copyToClipboard(c: ClipItem) {
  try {
    if (c.kind === "image") {
      const res = await fetch(c.content);
      const blob = await res.blob();
      // @ts-expect-error ClipboardItem types lag in some lib targets
      await navigator.clipboard.write([
        // @ts-expect-error see above
        new ClipboardItem({ [blob.type]: blob }),
      ]);
    } else {
      await navigator.clipboard.writeText(c.content);
    }
    toast("Copied");
  } catch (e) {
    console.error(e);
    toast("Copy failed");
  }
}

async function copyAsMarkdown(c: ClipItem) {
  let md: string;
  if (c.kind === "image") {
    md = `![${c.source.title || "image"}](${c.source.url || ""})`;
  } else if (c.kind === "link") {
    md = `[${c.preview || c.content}](${c.content})`;
  } else {
    const cite = c.source.url ? `\n\n— [${c.source.title || c.source.url}](${c.source.url})` : "";
    md = `> ${c.content.replace(/\n/g, "\n> ")}${cite}`;
  }
  await navigator.clipboard.writeText(md);
  toast("Copied as Markdown");
}

listEl.addEventListener("click", async (e) => {
  const target = e.target as HTMLElement;
  const clipEl = target.closest(".clip") as HTMLElement | null;
  if (!clipEl) return;
  const id = clipEl.dataset.id!;
  const act = (target.dataset.act as string) || "copy";
  const clips = await listClips({ limit: 10_000 });
  const c = clips.find((x) => x.id === id);
  if (!c) return;
  if (act === "del") {
    await deleteClip(id);
    await render();
  } else if (act === "pin") {
    await togglePin(id);
    await render();
  } else {
    if (e.shiftKey) await copyAsMarkdown(c);
    else await copyToClipboard(c);
  }
});

searchEl.addEventListener("input", () => render());

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentKind = (btn.dataset.kind as ClipKind | "all") || "all";
    render();
  });
});

pinnedToggle.addEventListener("click", () => {
  pinnedOnly = !pinnedOnly;
  pinnedToggle.classList.toggle("active", pinnedOnly);
  render();
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Clear all unpinned clips?")) return;
  const all = await listClips({ limit: 10_000 });
  for (const c of all) if (!c.pinned) await deleteClip(c.id);
  await render();
});

render();
