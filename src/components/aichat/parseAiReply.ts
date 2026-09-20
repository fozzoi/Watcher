// src/components/aichat/parseAiReply.ts
//
// Turns whatever the model returned into a valid, render-safe reply.
// Handles: code fences, prose around the JSON, raw newlines inside strings,
// double-escaped "\n", trailing commas, JSON nested inside "text",
// malformed objects like {"kind":"text":"text":"..."} and truncated output.

import type { ListItem } from './AiStructuredList';

export type AiReply =
  | { kind: 'text'; text: string }
  | { kind: 'movies'; text: string; titles: string[] }
  | { kind: 'actors'; text: string; names: string[] }
  | { kind: 'movie_detail'; text: string; title: string }
  | { kind: 'table'; title?: string; text: string; headers: string[]; rows: string[][] }
  | { kind: 'list'; title?: string; text: string; ordered: boolean; items: ListItem[] };

const EMPTY = "Sorry, I couldn't get a proper answer. Try again.";

/** Fix literal "\n", "\"" etc. so the UI never shows escape sequences. */
export function cleanText(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/\\r\\n|\\n/g, '\n')
    .replace(/\\t/g, '  ')
    .replace(/\\"/g, '"')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const opt = (v: unknown) => cleanText(v) || undefined;

function stripFences(s: string) {
  return s
    .trim()
    .replace(/^```(?:json|JSON)?\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
}

/** Escape raw line breaks / tabs that appear inside JSON string literals. */
function escapeStringControlChars(s: string): string {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (!inStr) {
      if (ch === '"') inStr = true;
      out += ch;
      continue;
    }
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { out += ch; esc = true; continue; }
    if (ch === '"') { inStr = false; out += ch; continue; }
    if (ch === '\n') { out += '\\n'; continue; }
    if (ch === '\r') continue;
    if (ch === '\t') { out += '\\t'; continue; }
    out += ch;
  }
  return out;
}

/** First balanced {...} block (string-aware). */
function firstJsonObject(s: string): string | null {
  const start = s.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

function tryParse(s: string): any | null {
  const fixed = escapeStringControlChars(s);
  const variants = [s, fixed, fixed.replace(/,\s*([}\]])/g, '$1')];
  for (const v of variants) {
    try {
      const o = JSON.parse(v);
      if (o && typeof o === 'object' && !Array.isArray(o)) return o;
    } catch {}
  }
  return null;
}

function decodeJsonString(s: string): string {
  try {
    return JSON.parse('"' + s.replace(/\r/g, '').replace(/\n/g, '\\n') + '"');
  } catch {
    return cleanText(s);
  }
}

function grabArray(raw: string, key: string): string[] | null {
  const m = raw.match(new RegExp('"' + key + '"\\s*:\\s*(\\[[\\s\\S]*?\\])'));
  if (!m) return null;
  try {
    const a = JSON.parse(m[1]);
    return Array.isArray(a) ? a.map((x) => cleanText(x)).filter(Boolean) : null;
  } catch {
    return null;
  }
}

/** Last resort for broken / truncated JSON: pull out what we can. */
function salvage(raw: string): AiReply {
  const m = raw.match(/[\s\S]*"text"\s*:\s*"([\s\S]*?)"?\s*\}?\s*$/);
  if (!m) {
    // No "text" key. Plain prose -> show it. JSON-looking garbage -> friendly error.
    return /^[\[{]/.test(raw) ? { kind: 'text', text: EMPTY } : { kind: 'text', text: cleanText(raw) || EMPTY };
  }
  const body = m[1].split(/"\s*,\s*"(?:kind|titles|names|title|headers|rows|items|ordered)"\s*:/)[0];
  const text = decodeJsonString(body) || EMPTY;

  const titles = grabArray(raw, 'titles');
  if (titles?.length) return { kind: 'movies', text, titles };
  const names = grabArray(raw, 'names');
  if (names?.length) return { kind: 'actors', text, names };
  return { kind: 'text', text };
}

function strList(a: unknown): string[] {
  if (!Array.isArray(a)) return [];
  return a
    .map((x: any) => cleanText(x && typeof x === 'object' ? x.title ?? x.name : x))
    .filter(Boolean);
}

function normalize(o: any, depth: number): AiReply {
  const text = cleanText(o.text);

  // Model put a whole JSON reply inside "text" -> unwrap it.
  if (depth < 2 && text.startsWith('{') && /"kind"\s*:/.test(text)) {
    return parseAiReply(text, depth + 1);
  }

  const asText = (): AiReply => ({ kind: 'text', text: text || EMPTY });

  switch (o.kind) {
    case 'movies': {
      const titles = strList(o.titles);
      return titles.length ? { kind: 'movies', text, titles } : asText();
    }
    case 'actors': {
      const names = strList(o.names);
      return names.length ? { kind: 'actors', text, names } : asText();
    }
    case 'movie_detail': {
      const title = cleanText(o.title);
      return title ? { kind: 'movie_detail', text, title } : asText();
    }
    case 'table': {
      const rawRows: unknown[][] = Array.isArray(o.rows) ? o.rows.filter(Array.isArray) : [];
      const headers = strList(o.headers);
      const cols = Math.max(headers.length, ...rawRows.map((r) => r.length), 0);
      if (!cols || !rawRows.length) return asText();
      return {
        kind: 'table',
        title: opt(o.title),
        text,
        headers: Array.from({ length: cols }, (_, i) => headers[i] ?? ''),
        rows: rawRows.map((r) => Array.from({ length: cols }, (_, i) => cleanText(r[i]) || '—')),
      };
    }
    case 'list': {
      const items: ListItem[] = (Array.isArray(o.items) ? o.items : [])
        .map((it: any) =>
          it && typeof it === 'object'
            ? { title: opt(it.title), subtitle: opt(it.subtitle), value: opt(it.value), tag: opt(it.tag) }
            : { title: opt(it) }
        )
        .filter((it: ListItem) => it.title || it.subtitle);
      return items.length
        ? { kind: 'list', title: opt(o.title), text, ordered: o.ordered !== false, items }
        : asText();
    }
    default:
      return asText();
  }
}

export function parseAiReply(raw: string, depth = 0): AiReply {
  const src = stripFences(String(raw ?? ''));
  if (!src) return { kind: 'text', text: EMPTY };

  const obj = firstJsonObject(src);
  if (obj) {
    const parsed = tryParse(obj);
    if (parsed) return normalize({ kind: 'text', ...parsed }, depth);
  }
  return salvage(src);
}
