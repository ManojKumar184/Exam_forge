/**
 * JEE/NEET section and paper metadata from headers.
 */

const SECTION_RE =
  /^(?:SECTION|PART)\s+([A-Z0-9]+)(?:\s*[-:]?\s*(.+))?$/i;

const JEE_SECTION_HINTS = [
  { re: /\bsection\s+a\b/i, name: 'Section A', examPart: 'mcq' },
  { re: /\bsection\s+b\b/i, name: 'Section B', examPart: 'numerical' },
  { re: /\bmultiple\s+correct\b|one\s+or\s+more\s+(?:than\s+one\s+)?correct\b/i, name: 'Multiple Correct MCQ', examPart: 'mcq_multiple' },
  { re: /\bsingle\s+correct\b|one\s+correct\b|\bmultiple\s+choice\b/i, name: 'Single Correct MCQ', examPart: 'mcq' },
  { re: /\bnumeric\s+value\b|\bnumerical\s+value\b|\binteger\s+type\b/i, name: 'Numerical/Integer', examPart: 'numerical' },
  { re: /\bmatch\s+the\s+following\b/i, name: 'Match the Following', examPart: 'match' },
  { re: /\bcomprehension\b|\bpassage\s+based\b/i, name: 'Comprehension', examPart: 'comprehension' },
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
