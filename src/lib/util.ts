/** Tiny utilities: id generation, hashing, hostname, time ago, auto-tagging. */

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** djb2 hash, base36 — fast, good-enough for dedup keying. */
export function quickHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

export function hostFrom(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

export function escapeHtml(s: string): string {
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

/** Heuristic auto-tags. Avoid LLMs; keep this local + instant. */
export function autoTag(content: string, kind: string, host?: string): string[] {
  const tags = new Set<string>();
  if (host) tags.add(host);
  if (kind === "image") tags.add("image");
  if (kind === "link") tags.add("link");

  if (kind === "text") {
    const t = content.trim();
    if (/^https?:\/\//.test(t) && !t.includes(" ")) tags.add("url");
    if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(t)) tags.add("email");
    if (/^[\+\d][\d\s\-().]{7,}$/.test(t)) tags.add("phone");
    if (/^[A-F0-9]{32,}$/i.test(t)) tags.add("hash");
    if (/^[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}$/.test(t)) tags.add("jwt");
    if (
      /\b(function|const|let|var|class|import|export|=>|<\/?\w|def |print\()/.test(t)
    )
      tags.add("code");
    if (t.split(/\s+/).length > 80) tags.add("long");
    if (/^\d+([.,]\d+)?$/.test(t)) tags.add("number");
  }

  return Array.from(tags);
}
