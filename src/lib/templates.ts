/**
 * Snippet templates.
 *
 * Any text clip whose body contains `{{token}}` placeholders is treated as
 * a template. When copied, the tokens are expanded against live context
 * (today's date, the current tab's URL / title / host, etc.).
 *
 * Tokens are case-insensitive and may carry a default after a pipe:
 *
 *   Hi from {{host}} on {{date}}
 *   PR: {{title|untitled}} <{{url}}>
 *   {{uuid}}-{{time}}
 *
 * Unknown tokens are left intact so users see immediately that something
 * is mis-spelled instead of silently producing an empty paste.
 *
 * Pure, no IO — caller supplies the context. Local-only by construction.
 */

export interface TemplateContext {
  /** Active tab's URL (when available). */
  url?: string;
  /** Active tab's title (when available). */
  title?: string;
  /** Active tab's hostname, with `www.` stripped. */
  host?: string;
  /** Current clipboard text, when caller chooses to read it. */
  clipboard?: string;
  /** Override for `now` — tests inject a stable timestamp. */
  now?: Date;
}

/**
 * Token grammar: `{{name}}` or `{{name|fallback}}`. Name starts with a
 * letter and may contain letters/digits/underscore/hyphen. Fallback runs
 * to the closing `}}` and is taken literally (no nested tokens).
 */
const TOKEN_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_-]*)\s*(?:\|([^}]*?))?\s*\}\}/g;

/**
 * Returns true if the input contains at least one valid template token.
 * Used to auto-flag template clips on capture and to skip the (slower)
 * expand path for plain text.
 */
export function hasTemplateTokens(s: string): boolean {
  if (!s) return false;
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(s);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function isoTime(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function isoDateTime(d: Date): string {
  return `${isoDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

function uuidLike(): string {
  // Prefer the platform crypto.randomUUID when available; fall back to a
  // simple time + random base36 hash in older runtimes.
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Expand `{{tokens}}` in `s` against `ctx`. Tokens whose lookup returns
 * undefined fall back to the `|default` portion when present, or get left
 * intact when absent — that's a deliberate "unknown token" affordance so
 * typos don't silently vanish.
 */
export function expandTemplate(s: string, ctx: TemplateContext = {}): string {
  if (!s) return s;
  const now = ctx.now ?? new Date();
  const lookup = (rawName: string): string | undefined => {
    const name = rawName.toLowerCase();
    switch (name) {
      case "date":
        return isoDate(now);
      case "time":
        return isoTime(now);
      case "datetime":
      case "date_time":
      case "date-time":
        return isoDateTime(now);
      case "iso":
      case "isoz":
        return now.toISOString();
      case "year":
        return String(now.getFullYear());
      case "month":
        return pad2(now.getMonth() + 1);
      case "day":
        return pad2(now.getDate());
      case "weekday":
        return now.toLocaleDateString(undefined, { weekday: "long" });
      case "host":
        return ctx.host || undefined;
      case "url":
        return ctx.url || undefined;
      case "title":
        return ctx.title || undefined;
      case "clipboard":
      case "clip":
        return ctx.clipboard || undefined;
      case "uuid":
      case "id":
        return uuidLike();
      default:
        return undefined;
    }
  };

  return s.replace(TOKEN_RE, (match, rawName: string, fallback?: string) => {
    const v = lookup(rawName);
    if (v != null) return v;
    if (fallback != null) return fallback;
    // Unknown token — leave the original `{{name}}` visible.
    return match;
  });
}

/** Returns the unique token names found in `s`, for previews / UI hints. */
export function listTokens(s: string): string[] {
  const out = new Set<string>();
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(s)) !== null) {
    out.add(m[1].toLowerCase());
  }
  return Array.from(out);
}
