/**
 * Reads the composer's JSON answer while it is still streaming.
 *
 * The backend forwards model output as it is written, so the text is usually a JSON
 * prefix such as `{"opening": "为你推荐了 2`. This tolerant parser keeps every
 * complete or partially written string it can see, letting the opening and each
 * product reason appear word by word. Follow-up suggestions are only shown once the
 * whole answer is complete, so chips never flicker in half-written.
 */
export interface Answer {
  kind: 'json' | 'text';
  complete: boolean;
  opening: string;
  reasons: Record<string, string>;
  followups: string[];
}

type Cursor = { text: string; at: number };

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };

function skipSpace(c: Cursor) {
  while (c.at < c.text.length && /\s/.test(c.text[c.at])) c.at += 1;
}

function readString(c: Cursor): { value: string; closed: boolean } {
  c.at += 1;
  let value = '';
  while (c.at < c.text.length) {
    const ch = c.text[c.at];
    c.at += 1;
    if (ch === '"') return { value, closed: true };
    if (ch !== '\\') {
      value += ch;
      continue;
    }
    if (c.at >= c.text.length) break;
    const escape = c.text[c.at];
    c.at += 1;
    if (escape === 'u') {
      const hex = c.text.slice(c.at, c.at + 4);
      if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
        c.at = c.text.length;
        break;
      }
      value += String.fromCharCode(parseInt(hex, 16));
      c.at += 4;
    } else {
      value += ESCAPES[escape] ?? escape;
    }
  }
  return { value, closed: false };
}

function readLiteral(c: Cursor): unknown {
  const start = c.at;
  while (c.at < c.text.length && !/[,\]}\s]/.test(c.text[c.at])) c.at += 1;
  try {
    return JSON.parse(c.text.slice(start, c.at));
  } catch {
    return undefined;
  }
}

function readValue(c: Cursor): unknown {
  skipSpace(c);
  if (c.at >= c.text.length) return undefined;
  const ch = c.text[c.at];
  if (ch === '{') return readObject(c);
  if (ch === '[') return readArray(c);
  if (ch === '"') return readString(c).value;
  return readLiteral(c);
}

function readObject(c: Cursor): Record<string, unknown> {
  c.at += 1;
  const result: Record<string, unknown> = {};
  while (c.at < c.text.length) {
    skipSpace(c);
    const ch = c.text[c.at];
    if (ch === '}') {
      c.at += 1;
      return result;
    }
    if (ch === ',') {
      c.at += 1;
      continue;
    }
    if (ch !== '"') break;
    const key = readString(c);
    skipSpace(c);
    if (!key.closed || c.text[c.at] !== ':') break;
    c.at += 1;
    const value = readValue(c);
    if (value !== undefined) result[key.value] = value;
  }
  c.at = c.text.length;
  return result;
}

function readArray(c: Cursor): unknown[] {
  c.at += 1;
  const result: unknown[] = [];
  while (c.at < c.text.length) {
    skipSpace(c);
    const ch = c.text[c.at];
    if (ch === ']') {
      c.at += 1;
      return result;
    }
    if (ch === ',') {
      c.at += 1;
      continue;
    }
    const value = readValue(c);
    if (value === undefined) break;
    result.push(value);
  }
  c.at = c.text.length;
  return result;
}

function jsonStart(text: string): number {
  if (text.startsWith('{')) return 0;
  const start = text.indexOf('{');
  // Accept a short single-line preface such as "好的：" before the object.
  return start > 0 && start <= 40 && !text.slice(0, start).includes('\n') ? start : -1;
}

function fromObject(value: unknown, complete: boolean): Answer {
  const data = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const reasons: Record<string, string> = {};
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      const entry = item as Record<string, unknown> | null;
      if (entry && typeof entry.productId === 'string' && typeof entry.description === 'string') {
        reasons[entry.productId] = entry.description;
      }
    }
  }
  const followups = complete && Array.isArray(data.followup)
    ? data.followup.filter((text): text is string => typeof text === 'string' && text.trim() !== '')
    : [];
  return {
    kind: 'json',
    complete,
    opening: typeof data.opening === 'string' ? data.opening : '',
    reasons,
    followups,
  };
}

export function parseAnswer(raw: string): Answer {
  const text = (raw || '').trim();
  const start = jsonStart(text);
  if (start < 0) {
    return { kind: 'text', complete: true, opening: text, reasons: {}, followups: [] };
  }
  const body = text.slice(start);
  try {
    return fromObject(JSON.parse(body), true);
  } catch {
    return fromObject(readValue({ text: body, at: 0 }), false);
  }
}
