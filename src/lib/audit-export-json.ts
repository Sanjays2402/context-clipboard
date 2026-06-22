/**
 * Privacy audit ring → standalone export envelope.
 *
 * The full export bundle (lib/db.exportAll) already round-trips the
 * audit log alongside clips + settings, but a user often wants JUST
 * the audit log as a privacy receipt — e.g. to attach to a "what did
 * this extension do with my data" question, or to keep a personal
 * record of redactions without leaking the underlying clip content.
 *
 * This helper produces a tiny, self-describing JSON envelope. It does
 * NOT include any clip content — only the audit metadata (kind,
 * timestamps, clip ids, hosts, short detail tails). The clip ids are
 * preserved so a future tool could correlate against a clip export,
 * but in isolation the file reads as anonymous-ish (host names + ids
 * + action kinds + timestamps).
 *
 * Versioned via an explicit `version` field so a future schema bump
 * (e.g. adding a new audit kind) can stay backwards-compatible with
 * older receipts on disk.
 */

import type { PrivacyAuditEntry } from "./db";

export interface AuditExportEnvelope {
  /** Envelope schema version — bump when the shape changes. */
  version: 1;
  /** Stamped at export time — Unix-ms. */
  exportedAt: number;
  /** Producer label — humans reading the file should know which extension wrote it. */
  source: "context-clipboard/audit";
  /** Total entries in the envelope (mirrors entries.length for quick scanning). */
  count: number;
  /** Active retention cap at export time (so a future re-import knows the ceiling). */
  retention?: number;
  /** The actual ring — newest first, identical shape to PrivacyAuditEntry. */
  entries: PrivacyAuditEntry[];
}

export function buildAuditExport(
  entries: PrivacyAuditEntry[],
  opts: { retention?: number; now?: number } = {},
): AuditExportEnvelope {
  // Defensive copy so callers can mutate their list without affecting
  // the envelope. We also strip `undefined`-valued fields per entry so
  // the JSON stays tight (JSON.stringify drops them anyway, but the
  // round-trip semantics are clearer when the in-memory shape matches).
  const clean: PrivacyAuditEntry[] = entries.map((e) => {
    const out: PrivacyAuditEntry = {
      id: e.id,
      kind: e.kind,
      at: e.at,
      clipId: e.clipId,
    };
    if (e.host) out.host = e.host;
    if (e.detail) out.detail = e.detail;
    return out;
  });
  const env: AuditExportEnvelope = {
    version: 1,
    exportedAt: opts.now ?? Date.now(),
    source: "context-clipboard/audit",
    count: clean.length,
    entries: clean,
  };
  if (typeof opts.retention === "number" && opts.retention > 0) {
    env.retention = opts.retention;
  }
  return env;
}

/**
 * Pretty-printed JSON for download. 2-space indent matches the rest
 * of the project's export style so the file is human-scannable.
 */
export function stringifyAuditExport(env: AuditExportEnvelope): string {
  return JSON.stringify(env, null, 2);
}

/**
 * Conventional filename for the download. Calls Date.toISOString and
 * slices the YYYY-MM-DD prefix so the filename sorts naturally across
 * a directory full of receipts.
 */
export function auditExportFilename(at: number = Date.now()): string {
  const iso = new Date(at).toISOString();
  const day = iso.slice(0, 10);
  return `context-clipboard-audit-${day}.json`;
}
