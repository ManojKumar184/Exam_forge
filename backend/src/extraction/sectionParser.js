/**
 * JEE/NEET section and paper metadata from headers.
 */

const SECTION_RE =
  /^(?:SECTION|PART)\s*[-:]?\s*([A-Z0-9]+)(?:\s*[-:]\s*(.+))?$/i;

const JEE_SECTION_HINTS = [
  { re: /section\s*a/i, name: 'Section A', examPart: 'mcq' },
  { re: /section\s*b/i, name: 'Section B', examPart: 'numerical' },
  { re: /single\s*correct/i, name: 'Single Correct MCQ', examPart: 'mcq' },
  { re: /multiple\s*correct/i, name: 'Multiple Correct MCQ', examPart: 'mcq_multiple' },
  { re: /numerical\s*value|integer\s*type/i, name: 'Numerical/Integer', examPart: 'numerical' },
  { re: /match\s*the\s*following/i, name: 'Match the Following', examPart: 'match' },
  { re: /comprehension|passage\s*based/i, name: 'Comprehension', examPart: 'comprehension' },
];

export function detectSectionHeader(line) {
  const trimmed = line.trim();
  const m = trimmed.match(SECTION_RE);
  if (m) {
    return { name: `Section ${m[1]}`, subtitle: m[2]?.trim() || null };
  }
  for (const hint of JEE_SECTION_HINTS) {
    if (hint.re.test(trimmed)) return { name: hint.name, examPart: hint.examPart };
  }
  if (/^mathematics|^physics|^chemistry/i.test(trimmed) && trimmed.length < 40) {
    return { name: trimmed, subjectHint: trimmed.split(/\s/)[0] };
  }
  return null;
}

export function parseDocumentSections(rawText) {
  const lines = rawText.replace(/\r\n/g, '\n').split('\n');
  let currentSection = 'General';
  const sections = [{ name: 'General', lineIndex: 0 }];

  for (let i = 0; i < lines.length; i += 1) {
    const header = detectSectionHeader(lines[i]);
    if (header) {
      currentSection = header.name;
      sections.push({ name: currentSection, lineIndex: i, ...header });
    }
  }
  return sections;
}

export function sectionForLineIndex(sections, lineIndex) {
  let active = sections[0]?.name || 'General';
  for (const s of sections) {
    if (s.lineIndex <= lineIndex) active = s.name;
    else break;
  }
  return active;
}
