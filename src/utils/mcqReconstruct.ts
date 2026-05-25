import type { QuestionOption } from '../types';
import { wrapOptionFractions } from './equationAutoWrap';

const INLINE_MCQ_MARKER = /(?<![A-Za-z0-9])(\(\s*([A-D])\s*\))/gi;
const OPTION_LINE =
  /^\s*(?:\(?\s*([a-dA-D])\s*\)?\s*[\).:\-–—]\s*)(.+)$/;
const LABEL_ORDER = ['a', 'b', 'c', 'd'];

function isValidSequence(markers: { label: string }[]): boolean {
  if (markers.length < 2) return false;
  return new Set(markers.map((m) => m.label)).size >= 2;
}

function dedupeByLabel(options: Array<QuestionOption & { label?: string }>) {
  const map = new Map<string, QuestionOption & { label?: string }>();
  for (const o of options) {
    const label = (o.label || '').toLowerCase();
    if (!label) continue;
    const prev = map.get(label);
    if (!prev || (o.text || '').length > (prev.text || '').length) map.set(label, o);
  }
  return LABEL_ORDER.map((l) => map.get(l)).filter(Boolean) as QuestionOption[];
}

export function extractMcqOptions(text: string): { stem: string; options: QuestionOption[] } {
  if (!text) return { stem: text, options: [] };

  const markers: { index: number; label: string; len: number }[] = [];
  const re = new RegExp(INLINE_MCQ_MARKER.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) {
    markers.push({ index: m.index, label: m[2].toLowerCase(), len: m[0].length });
  }

  if (isValidSequence(markers)) {
    const options: Array<QuestionOption & { label?: string }> = [];
    for (let i = 0; i < markers.length; i += 1) {
      const start = markers[i].index + markers[i].len;
      const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
      let chunk = text.slice(start, end).replace(/^[\s).:\-–—]+/, '').trim();
      chunk = wrapOptionFractions(chunk);
      if (chunk) options.push({ label: markers[i].label, text: chunk });
    }
    return { stem: text.slice(0, markers[0].index).trim(), options: dedupeByLabel(options) };
  }

  const lineOpts: Array<QuestionOption & { label?: string }> = [];
  const stemLines: string[] = [];
  for (const line of text.split('\n')) {
    const parsed = line.trim().match(OPTION_LINE);
    if (parsed) {
      lineOpts.push({
        label: parsed[1].toLowerCase(),
        text: wrapOptionFractions(parsed[2].trim()),
      });
    } else if (lineOpts.length && line.trim() && !/^(?:Q|Question)\s*\d/i.test(line)) {
      const last = lineOpts[lineOpts.length - 1];
      last.text = `${last.text} ${line.trim()}`.trim();
    } else {
      stemLines.push(line);
    }
  }

  if (lineOpts.length >= 2) {
    return { stem: stemLines.join('\n').trim(), options: dedupeByLabel(lineOpts) };
  }

  return { stem: text, options: [] };
}

export function countMcqMarkers(text: string): number {
  const labels = new Set<string>();
  const re = new RegExp(INLINE_MCQ_MARKER.source, 'gi');
  let m;
  while ((m = re.exec(text)) !== null) labels.add(m[2].toLowerCase());
  return labels.size;
}
