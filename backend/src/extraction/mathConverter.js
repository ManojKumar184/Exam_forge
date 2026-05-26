/**
 * Unified OMML and MathML to LaTeX equation converter.
 * Self-contained XML parser and translator.
 */

export function parseXml(xmlStr) {
  // Remove comments and XML declarations
  const cleanXml = xmlStr
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '');

  let pos = 0;

  function parseNode() {
    while (pos < cleanXml.length && /\s/.test(cleanXml[pos])) {
      pos++;
    }

    if (pos >= cleanXml.length) return null;

    if (cleanXml[pos] === '<') {
      if (cleanXml[pos + 1] === '/') {
        // Closing tag
        const closeEnd = cleanXml.indexOf('>', pos);
        if (closeEnd !== -1) {
          pos = closeEnd + 1;
        }
        return null;
      }

      const tagEnd = cleanXml.indexOf('>', pos);
      if (tagEnd === -1) return null;

      let tagContent = cleanXml.slice(pos + 1, tagEnd);
      pos = tagEnd + 1;

      const isSelfClosing = tagContent.endsWith('/');
      if (isSelfClosing) {
        tagContent = tagContent.slice(0, -1).trim();
      }

      const spaceIdx = tagContent.indexOf(' ');
      let tag = spaceIdx === -1 ? tagContent : tagContent.slice(0, spaceIdx);
      
      // Remove namespace prefix
      const colonIdx = tag.indexOf(':');
      if (colonIdx !== -1) {
        tag = tag.slice(colonIdx + 1);
      }

      const attrs = {};
      if (spaceIdx !== -1) {
        const attrStr = tagContent.slice(spaceIdx + 1);
        const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let attrMatch;
        while ((attrMatch = attrRegex.exec(attrStr)) !== null) {
          const name = attrMatch[1];
          const val = attrMatch[2] !== undefined ? attrMatch[2] : attrMatch[3];
          const attrColonIdx = name.indexOf(':');
          const cleanAttrName = attrColonIdx !== -1 ? name.slice(attrColonIdx + 1) : name;
          attrs[cleanAttrName] = val;
        }
      }

      const node = { tag, attrs, children: [] };

      if (isSelfClosing) {
        return node;
      }

      while (pos < cleanXml.length) {
        while (pos < cleanXml.length && /\s/.test(cleanXml[pos])) {
          pos++;
        }
        if (pos >= cleanXml.length) break;

        if (cleanXml[pos] === '<') {
          if (cleanXml[pos + 1] === '/') {
            const closeEnd = cleanXml.indexOf('>', pos);
            if (closeEnd !== -1) {
              pos = closeEnd + 1;
            }
            break;
          }
          const child = parseNode();
          if (child) node.children.push(child);
        } else {
          let nextTag = cleanXml.indexOf('<', pos);
          if (nextTag === -1) nextTag = cleanXml.length;
          const text = cleanXml.slice(pos, nextTag);
          pos = nextTag;
          if (text) {
            node.children.push(text);
          }
        }
      }
      return node;
    } else {
      let nextTag = cleanXml.indexOf('<', pos);
      if (nextTag === -1) nextTag = cleanXml.length;
      const text = cleanXml.slice(pos, nextTag);
      pos = nextTag;
      return text;
    }
  }

  const rootNodes = [];
  while (pos < cleanXml.length) {
    const node = parseNode();
    if (node && typeof node !== 'string') {
      rootNodes.push(node);
    } else {
      pos++;
    }
  }
  return rootNodes;
}

export function serializeXml(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  const tag = node.tag;
  const attrsStr = Object.entries(node.attrs || {})
    .map(([k, v]) => ` ${k}="${v}"`)
    .join('');
  const childrenStr = (node.children || []).map(serializeXml).join('');
  return `<${tag}${attrsStr}>${childrenStr}</${tag}>`;
}

function validateBraces(str) {
  let count = 0;
  for (const char of str) {
    if (char === '{') count++;
    else if (char === '}') count--;
    if (count < 0) return false;
  }
  return count === 0;
}

export function ommlToAst(node, depth = 0) {
  if (!node) return null;
  if (typeof node === 'string') {
    return {
      type: 'text',
      sourceTag: '#text',
      rawSourceContent: node,
      nestingHierarchy: depth,
      inlineOrBlock: 'inline',
      value: node
    };
  }

  const tag = node.tag.toLowerCase();
  const children = node.children || [];
  const rawSourceContent = serializeXml(node);

  const getChildByTag = (t) =>
    children.find((c) => typeof c !== 'string' && c.tag.toLowerCase() === t.toLowerCase());

  const astChildren = () => children.map(c => ommlToAst(c, depth + 1)).filter(Boolean);

  const baseNode = {
    sourceTag: node.tag,
    rawSourceContent,
    nestingHierarchy: depth,
    inlineOrBlock: (tag === 'omathpara') ? 'block' : 'inline',
  };

  switch (tag) {
    case 'omathpara':
      return { ...baseNode, type: 'container', tag: 'omathpara', children: astChildren() };
    case 'omath':
      return { ...baseNode, type: 'container', tag: 'omath', children: astChildren() };
    case 'r':
      return { ...baseNode, type: 'container', tag: 'r', children: astChildren() };
    case 't':
      return { ...baseNode, type: 'text', value: children.join('') };
    case 'f': {
      const numNode = getChildByTag('num');
      const denNode = getChildByTag('den');
      return {
        ...baseNode,
        type: 'fraction',
        num: numNode ? { type: 'container', sourceTag: 'num', nestingHierarchy: depth + 1, children: numNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] },
        den: denNode ? { type: 'container', sourceTag: 'den', nestingHierarchy: depth + 1, children: denNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    case 'sup':
    case 'ssup': {
      const eNode = getChildByTag('e');
      const supNode = getChildByTag('sup');
      return {
        ...baseNode,
        type: 'superscript',
        base: eNode ? { type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] },
        sup: supNode ? { type: 'container', sourceTag: 'sup', nestingHierarchy: depth + 1, children: supNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    case 'sub':
    case 'ssub': {
      const eNode = getChildByTag('e');
      const subNode = getChildByTag('sub');
      return {
        ...baseNode,
        type: 'subscript',
        base: eNode ? { type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] },
        sub: subNode ? { type: 'container', sourceTag: 'sub', nestingHierarchy: depth + 1, children: subNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    case 'ssubsup': {
      const eNode = getChildByTag('e');
      const subNode = getChildByTag('sub');
      const supNode = getChildByTag('sup');
      return {
        ...baseNode,
        type: 'subsuperscript',
        base: eNode ? { type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] },
        sub: subNode ? { type: 'container', sourceTag: 'sub', nestingHierarchy: depth + 1, children: subNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] },
        sup: supNode ? { type: 'container', sourceTag: 'sup', nestingHierarchy: depth + 1, children: supNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    case 'rad': {
      const degNode = getChildByTag('deg');
      const eNode = getChildByTag('e');
      return {
        ...baseNode,
        type: 'radical',
        deg: degNode ? { type: 'container', sourceTag: 'deg', nestingHierarchy: depth + 1, children: degNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : null,
        expr: eNode ? { type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    case 'nary': {
      const subNode = getChildByTag('sub');
      const supNode = getChildByTag('sup');
      const eNode = getChildByTag('e');
      const naryPrNode = getChildByTag('naryPr');
      let op = '\\sum';
      if (naryPrNode) {
        const chrNode = (naryPrNode.children || []).find(
          (c) => typeof c !== 'string' && c.tag.toLowerCase() === 'chr'
        );
        if (chrNode?.attrs) {
          const val = chrNode.attrs.val || chrNode.attrs['m:val'];
          if (val === '∫' || val === 'Integral') op = '\\int';
          else if (val === '∑' || val === 'Sum') op = '\\sum';
          else if (val === '∏' || val === 'Product') op = '\\prod';
          else if (val) op = val;
        }
      }
      return {
        ...baseNode,
        type: 'nary',
        operator: op,
        sub: subNode ? { type: 'container', sourceTag: 'sub', nestingHierarchy: depth + 1, children: subNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : null,
        sup: supNode ? { type: 'container', sourceTag: 'sup', nestingHierarchy: depth + 1, children: supNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : null,
        expr: eNode ? { type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    case 'd': {
      const eNode = getChildByTag('e');
      const dPrNode = getChildByTag('dPr');
      let beg = '(';
      let end = ')';
      if (dPrNode) {
        const begChr = (dPrNode.children || []).find(
          (c) => typeof c !== 'string' && c.tag.toLowerCase() === 'begchr'
        );
        const endChr = (dPrNode.children || []).find(
          (c) => typeof c !== 'string' && c.tag.toLowerCase() === 'endchr'
        );
        if (begChr?.attrs) beg = begChr.attrs.val || begChr.attrs['m:val'] || '(';
        if (endChr?.attrs) end = endChr.attrs.val || endChr.attrs['m:val'] || ')';
      }
      return {
        ...baseNode,
        type: 'delimiter',
        beg,
        end,
        expr: eNode ? { type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    case 'm': {
      const mrNodes = children.filter(c => typeof c !== 'string' && c.tag.toLowerCase() === 'mr');
      const rows = mrNodes.map(mrNode => {
        const eNodes = (mrNode.children || []).filter(c => typeof c !== 'string' && c.tag.toLowerCase() === 'e');
        return eNodes.map(eNode => ({ type: 'container', sourceTag: 'e', nestingHierarchy: depth + 2, children: eNode.children.map(c => ommlToAst(c, depth + 3)).filter(Boolean) }));
      });
      return {
        ...baseNode,
        type: 'matrix',
        rows
      };
    }
    case 'eqarr': {
      const eNodes = children.filter(c => typeof c !== 'string' && c.tag.toLowerCase() === 'e');
      const rows = eNodes.map(eNode => ({ type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) }));
      return {
        ...baseNode,
        type: 'aligned',
        rows
      };
    }
    case 'acc': {
      const accPrNode = getChildByTag('accPr');
      const eNode = getChildByTag('e');
      let accChar = '→';
      if (accPrNode) {
        const chrNode = (accPrNode.children || []).find(
          (c) => typeof c !== 'string' && c.tag.toLowerCase() === 'chr'
        );
        if (chrNode?.attrs) {
          accChar = chrNode.attrs.val || chrNode.attrs['m:val'] || '→';
        }
      }
      return {
        ...baseNode,
        type: 'accent',
        char: accChar,
        expr: eNode ? { type: 'container', sourceTag: 'e', nestingHierarchy: depth + 1, children: eNode.children.map(c => ommlToAst(c, depth + 2)).filter(Boolean) } : { type: 'container', children: [] }
      };
    }
    default:
      return { ...baseNode, type: 'container', tag, children: astChildren() };
  }
}

export function mathmlToAst(node, depth = 0) {
  if (!node) return null;
  if (typeof node === 'string') {
    return {
      type: 'text',
      sourceTag: '#text',
      rawSourceContent: node,
      nestingHierarchy: depth,
      inlineOrBlock: 'inline',
      value: node
    };
  }

  const tag = node.tag.toLowerCase();
  const children = node.children || [];
  const rawSourceContent = serializeXml(node);
  const astChildren = () => children.map(c => mathmlToAst(c, depth + 1)).filter(Boolean);

  const baseNode = {
    sourceTag: node.tag,
    rawSourceContent,
    nestingHierarchy: depth,
    inlineOrBlock: (node.attrs?.display === 'block') ? 'block' : 'inline',
  };

  switch (tag) {
    case 'math':
      return { ...baseNode, type: 'container', tag: 'math', display: node.attrs?.display, children: astChildren() };
    case 'mfrac':
      return {
        ...baseNode,
        type: 'fraction',
        num: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] },
        den: children[1] ? mathmlToAst(children[1], depth + 1) : { type: 'container', children: [] }
      };
    case 'msup':
      return {
        ...baseNode,
        type: 'superscript',
        base: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] },
        sup: children[1] ? mathmlToAst(children[1], depth + 1) : { type: 'container', children: [] }
      };
    case 'msub':
      return {
        ...baseNode,
        type: 'subscript',
        base: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] },
        sub: children[1] ? mathmlToAst(children[1], depth + 1) : { type: 'container', children: [] }
      };
    case 'msubsup':
      return {
        ...baseNode,
        type: 'subsuperscript',
        base: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] },
        sub: children[1] ? mathmlToAst(children[1], depth + 1) : { type: 'container', children: [] },
        sup: children[2] ? mathmlToAst(children[2], depth + 1) : { type: 'container', children: [] }
      };
    case 'msqrt':
      return {
        ...baseNode,
        type: 'radical',
        deg: null,
        expr: { type: 'container', tag: 'mrow', nestingHierarchy: depth + 1, children: astChildren() }
      };
    case 'mroot':
      return {
        ...baseNode,
        type: 'radical',
        deg: children[1] ? mathmlToAst(children[1], depth + 1) : null,
        expr: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] }
      };
    case 'mfenced':
      return {
        ...baseNode,
        type: 'delimiter',
        beg: node.attrs?.open || '(',
        end: node.attrs?.close || ')',
        expr: { type: 'container', tag: 'mrow', nestingHierarchy: depth + 1, children: astChildren() }
      };
    case 'mi':
      return { ...baseNode, type: 'mi', value: children.join('').trim() };
    case 'mn':
      return { ...baseNode, type: 'mn', value: children.join('').trim() };
    case 'mo':
      return { ...baseNode, type: 'mo', value: children.join('').trim() };
    case 'mtext':
      return { ...baseNode, type: 'mtext', value: children.join('') };
    case 'mrow':
      return { ...baseNode, type: 'container', tag: 'mrow', children: astChildren() };
    case 'mtable': {
      const rows = children.filter(c => typeof c !== 'string' && c.tag.toLowerCase() === 'mtr');
      const astRows = rows.map(row => {
        const cells = (row.children || []).filter(c => typeof c !== 'string' && c.tag.toLowerCase() === 'mtd');
        return cells.map(cell => mathmlToAst(cell, depth + 2));
      });
      return { ...baseNode, type: 'matrix', rows: astRows };
    }
    case 'mtr':
      return { ...baseNode, type: 'container', tag: 'mtr', children: astChildren() };
    case 'mtd':
      return { ...baseNode, type: 'container', tag: 'mtd', children: astChildren() };
    case 'munder':
      return {
        ...baseNode,
        type: 'under',
        base: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] },
        under: children[1] ? mathmlToAst(children[1], depth + 1) : { type: 'container', children: [] }
      };
    case 'mover':
      return {
        ...baseNode,
        type: 'accent',
        char: children[1] ? (typeof children[1] === 'string' ? children[1] : (children[1].children || []).join('').trim()) : '',
        expr: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] }
      };
    case 'munderover':
      return {
        ...baseNode,
        type: 'underover',
        base: children[0] ? mathmlToAst(children[0], depth + 1) : { type: 'container', children: [] },
        under: children[1] ? mathmlToAst(children[1], depth + 1) : { type: 'container', children: [] },
        over: children[2] ? mathmlToAst(children[2], depth + 1) : { type: 'container', children: [] }
      };
    default:
      return { ...baseNode, type: 'container', tag, children: astChildren() };
  }
}

export function astToLatex(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;

  let result = '';

  const compile = () => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'mi': {
        const text = node.value;
        if (text.length > 1 && !text.startsWith('\\')) {
          if (['sin', 'cos', 'tan', 'log', 'ln', 'lim', 'det', 'max', 'min'].includes(text)) {
            return `\\${text}`;
          }
          return `\\text{${text}}`;
        }
        const greek = {
          alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta',
          theta: '\\theta', pi: '\\pi', sigma: '\\sigma', omega: '\\omega',
          lambda: '\\lambda', mu: '\\mu', phi: '\\phi', psi: '\\psi'
        };
        const greekSymbol = greek[text.toLowerCase()];
        if (greekSymbol) return greekSymbol;
        return text;
      }
      case 'mn':
        return node.value;
      case 'mo': {
        const text = node.value;
        if (text === '⋂') return '\\cap';
        if (text === '⋃') return '\\cup';
        if (text === '×') return '\\times';
        if (text === '÷') return '\\div';
        if (text === '±') return '\\pm';
        if (text === '→') return '\\rightarrow';
        if (text === '⇒') return '\\Rightarrow';
        if (text === '≠') return '\\neq';
        if (text === '≤') return '\\le';
        if (text === '≥') return '\\ge';
        if (text === '∞') return '\\infty';
        if (text === '&InvisibleTimes;') return '';
        return text;
      }
      case 'mtext':
        return `\\text{${node.value}}`;
      case 'container': {
        const sep = (node.tag === 'math' || node.tag === 'mrow' || node.tag === 'mtr' || node.tag === 'mtd') ? ' ' : '';
        const content = (node.children || []).map(astToLatex).filter(s => s !== '').join(sep);
        if (node.tag === 'math') {
          const isDisplay = node.display === 'block';
          return isDisplay ? `\n$$${content}$$\n` : `$${content}$`;
        }
        return content;
      }
      case 'fraction':
        return `\\frac{${astToLatex(node.num)}}{${astToLatex(node.den)}}`;
      case 'superscript':
        return `${astToLatex(node.base)}^{${astToLatex(node.sup)}}`;
      case 'subscript':
        return `${astToLatex(node.base)}_${astToLatex(node.sub)}`;
      case 'subsuperscript':
        return `${astToLatex(node.base)}_{${astToLatex(node.sub)}}^{${astToLatex(node.sup)}}`;
      case 'radical': {
        const expr = astToLatex(node.expr);
        if (node.deg) {
          return `\\sqrt[${astToLatex(node.deg)}]{${expr}}`;
        }
        return `\\sqrt{${expr}}`;
      }
      case 'nary': {
        const sub = node.sub ? `_{${astToLatex(node.sub)}}` : '';
        const sup = node.sup ? `^{${astToLatex(node.sup)}}` : '';
        return `${node.operator}${sub}${sup} ${astToLatex(node.expr)}`;
      }
      case 'delimiter': {
        const escapeChr = (c) => {
          if (c === '{') return '\\{';
          if (c === '}') return '\\}';
          return c;
        };
        return `\\left${escapeChr(node.beg)} ${astToLatex(node.expr)} \\right${escapeChr(node.end)}`;
      }
      case 'matrix': {
        const rowsLatex = (node.rows || []).map(row =>
          (row || []).map(astToLatex).join(' & ')
        ).join(' \\\\ ');
        return `\\begin{matrix}${rowsLatex}\\end{matrix}`;
      }
      case 'aligned': {
        const rowsLatex = (node.rows || []).map(astToLatex).join(' \\\\ ');
        return `\\begin{aligned}${rowsLatex}\\end{aligned}`;
      }
      case 'accent': {
        const expr = astToLatex(node.expr);
        const cleanOver = node.char?.trim() || '';
        if (cleanOver === '→' || cleanOver === '\\rightarrow' || cleanOver === '⃗' || cleanOver === '\u2192' || cleanOver === '\u20d7') {
          return `\\vec{${expr}}`;
        }
        if (cleanOver === '^' || cleanOver === '̂' || cleanOver === '\u0302' || cleanOver === 'hat') {
          return `\\hat{${expr}}`;
        }
        if (cleanOver === '¯' || cleanOver === '̄' || cleanOver === '\u0304' || cleanOver === 'bar' || cleanOver === '‾') {
          return `\\bar{${expr}}`;
        }
        return `\\overset{${cleanOver}}{${expr}}`;
      }
      case 'under':
        return `\\underset{${astToLatex(node.under)}}{${astToLatex(node.base)}}`;
      case 'underover':
        return `${astToLatex(node.base)}_{${astToLatex(node.under)}}^{${astToLatex(node.over)}}`;
      default:
        return '';
    }
  };

  result = compile();

  if (!validateBraces(result)) {
    console.warn("Unbalanced braces in LaTeX node compilation fallback to plain text:", result);
    if (node.children) {
      return (node.children || []).map(c => typeof c === 'string' ? c : c.rawSourceContent || '').join(' ');
    }
    return node.rawSourceContent || '';
  }

  return result;
}

export function translateOmmlNode(node) {
  const ast = ommlToAst(node);
  return astToLatex(ast);
}

export function translateMathmlNode(node) {
  const ast = mathmlToAst(node);
  return astToLatex(ast);
}

export function shieldMath(html) {
  if (!html) return { html: '', map: {}, trace: [] };

  const map = {};
  const trace = [];
  let counter = 1;
  let work = html;

  const processMatch = (xmlStr, isMathML) => {
    const placeholder = `__MATH_PLACEHOLDER_${counter}__`;
    try {
      const parsed = parseXml(xmlStr);
      if (parsed && parsed.length) {
        const ast = isMathML ? mathmlToAst(parsed[0]) : ommlToAst(parsed[0]);
        let latex = astToLatex(ast);

        const isBlock = xmlStr.toLowerCase().includes('omathpara') || xmlStr.toLowerCase().includes('display="block"');
        if (isBlock) {
          latex = `\n$$${latex.trim()}$$\n`;
        } else {
          if (!latex.startsWith('$')) {
            latex = `$${latex.trim()}$`;
          }
        }

        map[placeholder] = latex;
        trace.push({
          placeholder,
          latex,
          success: true,
          isBlock,
          sourceTag: parsed[0].tag,
          rawXml: xmlStr,
          ast,
        });
        counter++;
        return placeholder;
      }
    } catch (err) {
      trace.push({
        placeholder,
        latex: '',
        success: false,
        error: err.message,
        sourceTag: isMathML ? 'math' : 'oMath',
        rawXml: xmlStr,
        ast: null,
      });
      console.warn("Failed to parse OMML/MathML node:", err);
    }
    return null;
  };

  const oMathParaRegex = /<(?:m:)?oMathPara\b[^>]*>([\s\S]*?)<\/(?:m:)?oMathPara>/gi;
  work = work.replace(oMathParaRegex, (match) => {
    const pl = processMatch(match, false);
    return pl !== null ? pl : match;
  });

  const oMathRegex = /<(?:m:)?oMath\b[^>]*>([\s\S]*?)<\/(?:m:)?oMath>/gi;
  work = work.replace(oMathRegex, (match) => {
    const pl = processMatch(match, false);
    return pl !== null ? pl : match;
  });

  const mathmlRegex = /<math\b[^>]*>([\s\S]*?)<\/math>/gi;
  work = work.replace(mathmlRegex, (match) => {
    const pl = processMatch(match, true);
    return pl !== null ? pl : match;
  });

  return { html: work, map, trace };
}

export function convertHtmlMathToLatex(html) {
  const { html: shielded, map } = shieldMath(html);
  let restored = shielded;
  const keys = Object.keys(map).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    restored = restored.split(key).join(map[key]);
  }
  return restored;
}
