const OPTION_LINE_START = /^\s*(?:\(?\s*([a-fA-F])\s*\)?\s*[\).:\-–—]\s*|([a-fA-F])\s*[\).:\-–—]\s+)/i;

function normalizeOptionPrefixes(text) {
  if (!text) return '';
  let result = text;
  
  // Insert space before run-together option parentheses, e.g. "Only(B)" -> "Only (B)"
  // but avoid single letter math/probability functions like "P(B)" or "f(x)"
  result = result.replace(/\b([a-zA-Z]{2,})\((?=[a-fA-F]\))/g, '$1 (');
  
  result = result.replace(/(?<![a-zA-Z0-9_\$])[\(\[]\s*([a-fA-F])\s*[\)\]]/gi, (match, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  // Refined lookbehind to require whitespace or start of text before the option letter
  result = result.replace(/(?<=^|\s)\b([a-fA-F])\s*[\).:\-–—]/gi, (match, letter) => {
    return `OPTION_${letter.toUpperCase()}`;
  });
  
  return result;
}

function splitOptionsByMarkers(text) {
  if (!text) return { stem: '', options: [], success: false };
  
  const markerRegex = /\bOPTION_([A-F])\b/g;
  const matches = [];
  let match;
  while ((match = markerRegex.exec(text)) !== null) {
    matches.push({
      label: match[1].toLowerCase(),
      index: match.index,
      length: match[0].length
    });
  }
  
  const LABEL_ORDER = ['a', 'b', 'c', 'd', 'e', 'f'];
  const sequences = [];
  for (let i = 0; i < matches.length; i++) {
    const seq = [matches[i]];
    let lastIdx = LABEL_ORDER.indexOf(matches[i].label);
    for (let j = i + 1; j < matches.length; j++) {
      const idx = LABEL_ORDER.indexOf(matches[j].label);
      if (idx === lastIdx + 1) {
        seq.push(matches[j]);
        lastIdx = idx;
      }
    }
    sequences.push(seq);
  }
  
  let longest = [];
  for (const seq of sequences) {
    if (seq.length > longest.length) {
      longest = seq;
    }
  }
  
  if (longest.length >= 2) {
    const stem = text.slice(0, longest[0].index).trim();
    const options = [];
    for (let i = 0; i < longest.length; i++) {
      const start = longest[i].index + longest[i].length;
      const end = i + 1 < longest.length ? longest[i + 1].index : text.length;
      const optionText = text.slice(start, end).replace(/^[\s).:\-–—]+/, '').trim();
      options.push({
        label: longest[i].label,
        text: optionText
      });
    }
    return { stem, options, success: true };
  }
  
  return { stem: text, options: [], success: false };
}

const optionContent = "A, B and C Only(B) A and C only(C) D and E only(D) B and C only";
const normalized = normalizeOptionPrefixes("A. " + optionContent);
console.log("Normalized:", normalized);
const split = splitOptionsByMarkers(normalized);
console.log("Split Result:", JSON.stringify(split, null, 2));

const mathText = "If P(A)=0.5 and P(B)=0.3 then P(A∩B)=0.2.";
console.log("Math Text Normalized:", normalizeOptionPrefixes(mathText));
