export type ContentPart =
  | { type: 'text'; value: string }
  | { type: 'math'; value: string; display: boolean };


export function splitContentParts(raw: string): ContentPart[] {
  if (!raw?.trim()) return [];

  const parts: ContentPart[] = [];
  let remaining = raw;
  let safety = 0;

  while (remaining.length > 0 && safety < 200) {
    safety += 1;
    const displayMatch = remaining.match(/\$\$([\s\S]+?)\$\$/) || remaining.match(/\\\[([\s\S]+?)\\\]/);
    const inlineMatch = remaining.match(/\$([^$\n]+?)\$/) || remaining.match(/\\\(([^)]+?)\\\)/);

    const displayIndex = displayMatch ? remaining.indexOf(displayMatch[0]) : -1;
    const inlineIndex = inlineMatch ? remaining.indexOf(inlineMatch[0]) : -1;

    let useDisplay = false;
    let match: RegExpMatchArray | null = null;

    if (displayIndex >= 0 && (inlineIndex < 0 || displayIndex <= inlineIndex)) {
      useDisplay = true;
      match = displayMatch;
    } else if (inlineIndex >= 0) {
      match = inlineMatch;
    }

    if (!match || match.index === undefined) {
      parts.push({ type: 'text', value: remaining });
      break;
    }

    if (match.index > 0) {
      parts.push({ type: 'text', value: remaining.slice(0, match.index) });
    }

    const latex = match[1] || match[2] || '';
    parts.push({ type: 'math', value: latex.trim(), display: useDisplay });
    remaining = remaining.slice(match.index + match[0].length);
  }

  return parts;
}

export function hasRenderableMath(text?: string | null, latex?: string | null): boolean {
  if (latex?.trim()) return true;
  if (!text) return false;
  return /\$|\\frac|\\sqrt|\\int|\\sum|\\begin\{/.test(text);
}
