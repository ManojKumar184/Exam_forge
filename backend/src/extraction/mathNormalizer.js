// Valid LaTeX commands to keep. Unknown commands will have their backslashes stripped to avoid KaTeX crashes.
const VALID_LATEX_COMMANDS = new Set([
  'cap', 'cup', 'subset', 'subseteq', 'sqrt', 'pi', 'sum', 'int', 'le', 'ge', 'ne', 'neq', 'pm', 'times', 'div',
  'alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda', 'mu', 'sigma', 'phi', 'psi', 'omega',
  'Alpha', 'Beta', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Mu', 'Sigma', 'Phi', 'Psi', 'Omega',
  'frac', 'in', 'notin', 'cdot', 'infty', 'partial', 'nabla', 'approx', 'equiv', 'to', 'rightarrow',
  'left', 'right', 'bar', 'vec', 'hat', 'tilde', 'sin', 'cos', 'tan', 'log', 'ln', 'lim', 'matrix',
  'begin', 'end', 'text', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'over', 'choose',
  'dots', 'ldots', 'cdots', 'quad', 'qquad', 'textsf', 'texttt', 'textbf', 'textit', 'overline'
]);

const UNICODE_FRACTIONS = {
  '½': '\\frac{1}{2}',
  '¼': '\\frac{1}{4}',
  '¾': '\\frac{3}{4}',
  '⅓': '\\frac{1}{3}',
  '⅔': '\\frac{2}{3}',
  '⅕': '\\frac{1}{5}',
  '⅖': '\\frac{2}{5}',
  '⅗': '\\frac{3}{5}',
  '⅘': '\\frac{4}{5}',
  '⅙': '\\frac{1}{6}',
  '⅚': '\\frac{5}{6}',
  '⅛': '\\frac{1}{8}',
  '⅜': '\\frac{3}{8}',
  '⅝': '\\frac{5}{8}',
  '⅞': '\\frac{7}{8}'
};

/**
 * Checks if the context surrounding a matched substring contains mathematical indicators.
 */
export function checkMathContext(text, startIdx, endIdx) {
  const start = Math.max(0, startIdx - 50);
  const end = Math.min(text.length, endIdx + 50);
  const windowText = text.substring(start, end);

  // Check for LaTeX indicators
  if (/\$|\\\(|\\\[|\\frac|\\sqrt|\\cap|\\cup|\\pi|\\le|\\ge|\\ne|\\neq|\\pm|\\times|\\div/.test(windowText)) {
    return true;
  }

  // Clean of URLs, local paths, and HTML tags to prevent false math context
  const cleaned = windowText
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[a-zA-Z]:\\[a-zA-Z0-9\\._-]+/g, '')
    .replace(/<[^>]+>/g, '');

  // Check if operators exist nearby
  if (/[-+=\*<>]/.test(cleaned)) {
    return true;
  }

  return false;
}

/**
 * Pass 1: Pre-processing Repair (run on raw text blocks before shielding)
 */
export function preNormalizeMathText(text) {
  if (!text) return '';
  let out = text;

  // 1. Normalize unicode fractions
  for (const [uni, frac] of Object.entries(UNICODE_FRACTIONS)) {
    out = out.split(uni).join(frac);
  }

  // 2. Normalize fraction shorthand fragments (e.g. frac14, fracxy)
  out = out.replace(/(?<!\\)\bfrac([0-9])([0-9])\b/g, '\\frac{$1}{$2}');
  out = out.replace(/(?<!\\)\bfrac([a-zA-Z])([a-zA-Z])\b/g, '\\frac{$1}{$2}');
  out = out.replace(/(?<!\\)\bfrac(\{)/g, '\\frac$1');

  // Also catch fraction shorthands that already have backslashes
  out = out.replace(/\\frac([0-9])([0-9])\b/g, '\\frac{$1}{$2}');
  out = out.replace(/\\frac([a-zA-Z])([a-zA-Z])\b/g, '\\frac{$1}{$2}');

  // 3. Reconstruct missing root backslashes (e.g. sqrtx, sqrt(y))
  out = out.replace(/(?<!\\)\bsqrt([a-zA-Z0-9])\b/g, '\\sqrt{$1}');
  out = out.replace(/(?<!\\)\bsqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  out = out.replace(/(?<!\\)\bsqrt(\{)/g, '\\sqrt$1');

  // Also catch root shorthands that already have backslashes
  out = out.replace(/\\sqrt([a-zA-Z0-9])\b/g, '\\sqrt{$1}');
  out = out.replace(/\\sqrt\(([^)]+)\)/g, '\\sqrt{$1}');

  // 4. Restore basic superscript shorthand contextually (e.g. x2 -> x^2)
  // Only convert variables [x-za-dn-p] followed by [2-9] in mathematical context
  out = out.replace(/\b([x-za-dn-p])([2-9])\b/g, (match, variable, exponent, offset) => {
    if (checkMathContext(out, offset, offset + match.length)) {
      return `${variable}^${exponent}`;
    }
    return match;
  });

  return out;
}

/**
 * Balances mismatched curly braces.
 */
export function validateAndFixBraces(latex) {
  let openCount = 0;
  let closeCount = 0;
  for (const char of latex) {
    if (char === '{') openCount++;
    if (char === '}') closeCount++;
  }

  if (openCount === closeCount) {
    return latex;
  }

  if (openCount > closeCount) {
    return latex + '}'.repeat(openCount - closeCount);
  }

  let netCount = 0;
  let result = '';
  for (const char of latex) {
    if (char === '{') {
      netCount++;
      result += char;
    } else if (char === '}') {
      if (netCount > 0) {
        netCount--;
        result += char;
      }
    } else {
      result += char;
    }
  }
  result += '}'.repeat(netCount);
  return result;
}

/**
 * Strips backslashes from unrecognized LaTeX commands to avoid rendering crashes.
 */
export function sanitizeLatexCommands(latex) {
  return latex.replace(/\\[a-zA-Z]+/g, (match) => {
    const cmd = match.substring(1);
    if (VALID_LATEX_COMMANDS.has(cmd)) {
      return match;
    }
    return cmd;
  });
}

/**
 * Pass 2: LaTeX Normalization (run on individual math regions)
 */
export function normalizeLatexSyntax(mathText) {
  let text = mathText;

  // Standardize mathematical operators
  text = text.replace(/<=/g, ' \\le ');
  text = text.replace(/>=/g, ' \\ge ');
  text = text.replace(/!=/g, ' \\neq ');
  text = text.replace(/<>/g, ' \\neq ');
  text = text.replace(/\*/g, ' \\times ');

  // Replace raw unicode symbols
  text = text.replace(/∈/g, ' \\in ');
  text = text.replace(/∉/g, ' \\notin ');
  text = text.replace(/⊂/g, ' \\subset ');
  text = text.replace(/⊆/g, ' \\subseteq ');

  // Balance curly braces
  text = validateAndFixBraces(text);

  // Sanitize unknown LaTeX slash commands to prevent KaTeX crashes
  text = sanitizeLatexCommands(text);

  return text;
}
