/**
 * Export-format serializers.
 *
 * JSON exports are unchanged (handled directly with JSON.stringify so the
 * envelope structure matches what import expects). Markdown and CSV are
 * one-way exports — humans read them, importers don't try to round-trip them.
 *
 * All work happens in the popup; no network.
 */
import type { ClipItem } from "./types";
import { hostFrom } from "./util";

export type ExportFormat = "json" | "markdown" | "csv";

function isoOrEmpty(ms?: number): string {
  if (!ms || !Number.isFinite(ms)) return "";
  try {
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

/**
 * One human-readable Markdown blob: header + each clip as a section.
 * Image data URLs are skipped (too large for readability); the source
 * URL and metadata stay so users can recover the image elsewhere.
 */
export function toMarkdown(clips: ClipItem[]): string {
  const stamp = new Date().toISOString();
  const out: string[] = [];
  out.push(`# Context Clipboard export`);
  out.push("");
  out.push(`Exported: ${stamp}`);
  out.push(`Clips: ${clips.length}`);
  out.push("");
  out.push("---");
  out.push("");
  for (const c of clips) {
    const src = c.source.url || "";
    const host = hostFrom(src);
    const title = (c.source.title || host || c.kind).replace(/\n+/g, " ").trim();
    const pinBadge = c.pinned ? " (pinned)" : "";
    const tags = c.tags.length ? ` · _tags:_ ${c.tags.map((t) => `\`${t}\``).join(" ")}` : "";
    out.push(`## ${title}${pinBadge}`);
    out.push("");
    out.push(
      `_${c.kind} · captured ${isoOrEmpty(c.createdAt)} · ${c.hitCount}× copied_${tags}`,
    );
    if (src) out.push(`_source:_ <${src}>`);
    out.push("");
    if (c.kind === "image") {
      const dimNote = c.width && c.height ? ` (${c.width}×${c.height})` : "";
      const note = c.preview || `Image (${c.mime || "unknown"})${dimNote}`;
      out.push(`> ${note}`);
      if (c.ocrText) {
        out.push("");
        out.push("OCR:");
        out.push("");
        out.push("```");
        out.push(c.ocrText);
        out.push("```");
      }
    } else if (c.kind === "link") {
      out.push(`<${c.content}>`);
    } else {
      const looksLikeCode = /\n/.test(c.content) ||
        /\b(function|const|let|var|class|import|export|=>|<\/?\w|def |print\()/.test(c.content);
      if (looksLikeCode) {
        out.push("```");
        out.push(c.content);
        out.push("```");
      } else {
        out.push(`> ${c.content.replace(/\n/g, "\n> ")}`);
      }
    }
    if (c.source.nearbyText && c.source.nearbyText !== c.content) {
      out.push("");
      out.push(`_context:_ ${c.source.nearbyText.replace(/\s+/g, " ").slice(0, 400)}`);
    }
    out.push("");
    out.push("---");
    out.push("");
  }
  return out.join("\n");
}

function csvEscape(v: string | number | boolean | undefined | null): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * RFC-4180-compatible CSV. Image content (data URLs) is truncated to a sentinel
 * so spreadsheets don't choke; the source URL stays.
 */
export function toCsv(clips: ClipItem[]): string {
  const cols = [
    "id",
    "kind",
    "preview",
    "content",
    "source_url",
    "source_title",
    "host",
    "pinned",
    "redacted",
    "tags",
    "hit_count",
    "bytes",
    "image_width",
    "image_height",
    "created_at",
    "last_seen_at",
    "ocr_text",
    "nearby_text",
  ];
  const rows: string[] = [cols.join(",")];
  for (const c of clips) {
    const content = c.kind === "image"
      ? `[image ${c.mime || ""} ${c.bytes} bytes — data URL omitted]`
      : c.content;
    rows.push(
      [
        c.id,
        c.kind,
        c.preview || "",
        content,
        c.source.url || "",
        c.source.title || "",
        hostFrom(c.source.url),
        c.pinned ? "1" : "0",
        c.redacted ? "1" : "0",
        c.tags.join("|"),
        c.hitCount,
        c.bytes,
        c.width ?? "",
        c.height ?? "",
        isoOrEmpty(c.createdAt),
        isoOrEmpty(c.lastSeenAt),
        c.ocrText || "",
        c.source.nearbyText || "",
      ].map(csvEscape).join(","),
    );
  }
  return rows.join("\r\n");
}

export function mimeFor(format: ExportFormat): string {
  if (format === "markdown") return "text/markdown";
  if (format === "csv") return "text/csv";
  return "application/json";
}

export function extFor(format: ExportFormat, encrypted: boolean): string {
  if (format === "json") return encrypted ? "json" : "json";
  if (format === "markdown") return "md";
  return "csv";
}
