/**
 * Unified OMML and MathML to LaTeX equation converter.
 * Self-contained XML parser and translator.
 */

interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: (XmlNode | string)[];
}

export function parseXml(xmlStr: string): XmlNode[] {
  // Remove comments and XML declarations
  const cleanXml = xmlStr
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '');

  let pos = 0;

  function parseNode(): XmlNode | string | null {
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

      const attrs: Record<string, string> = {};
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

      const node: XmlNode = { tag, attrs, children: [] };

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

  const rootNodes: XmlNode[] = [];
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

export function translateOmmlNode(node: XmlNode | string): string {
  if (typeof node === 'string') {
    return node;
  }
  const tag = node.tag.toLowerCase();
  const children = node.children || [];

  const getChildByTag = (t: string) =>
    children.find((c) => typeof c !== 'string' && c.tag.toLowerCase() === t.toLowerCase()) as XmlNode | undefined;

  const convertAll = (nodes: (XmlNode | string)[]) =>
    nodes.map(translateOmmlNode).join('');

  switch (tag) {
    case 'omathpara':
      return `\n$$${convertAll(children)}$$\n`;
    case 'omath':
      return convertAll(children);
    case 'r':
      return convertAll(children);
    case 't':
      return convertAll(children);
    case 'f': {
      const numNode = getChildByTag('num');
      const denNode = getChildByTag('den');
      const numLatex = numNode ? convertAll(numNode.children) : '';
      const denLatex = denNode ? convertAll(denNode.children) : '';
      return `\\frac{${numLatex}}{${denLatex}}`;
    }
    case 'sup': {
      const eNode = getChildByTag('e');
      const supNode = getChildByTag('sup');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      const supLatex = supNode ? convertAll(supNode.children) : '';
      return `${eLatex}^{${supLatex}}`;
    }
    case 'sub': {
      const eNode = getChildByTag('e');
      const subNode = getChildByTag('sub');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      const subLatex = subNode ? convertAll(subNode.children) : '';
      return `${eLatex}_{${subLatex}}`;
    }
    case 'ssubsup': {
      const eNode = getChildByTag('e');
      const subNode = getChildByTag('sub');
      const supNode = getChildByTag('sup');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      const subLatex = subNode ? convertAll(subNode.children) : '';
      const supLatex = supNode ? convertAll(supNode.children) : '';
      return `${eLatex}_{${subLatex}}^{${supLatex}}`;
    }
    case 'rad': {
      const degNode = getChildByTag('deg');
      const eNode = getChildByTag('e');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      if (degNode) {
        const degLatex = convertAll(degNode.children);
        return `\\sqrt[${degLatex}]{${eLatex}}`;
      }
      return `\\sqrt{${eLatex}}`;
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
        ) as XmlNode | undefined;
        if (chrNode?.attrs) {
          const val = chrNode.attrs.val || chrNode.attrs['m:val'];
          if (val === '∫' || val === 'Integral') op = '\\int';
          else if (val === '∑' || val === 'Sum') op = '\\sum';
          else if (val === '∏' || val === 'Product') op = '\\prod';
          else if (val) op = val;
        }
      }

      const subLatex = subNode ? convertAll(subNode.children) : '';
      const supLatex = supNode ? convertAll(supNode.children) : '';
      const eLatex = eNode ? convertAll(eNode.children) : '';

      let limits = '';
      if (subLatex) limits += `_{${subLatex}}`;
      if (supLatex) limits += `^{${supLatex}}`;

      return `${op}${limits} ${eLatex}`;
    }
    case 'd': {
      const eNode = getChildByTag('e');
      const dPrNode = getChildByTag('dPr');

      let beg = '(';
      let end = ')';
      if (dPrNode) {
        const begChr = (dPrNode.children || []).find(
          (c) => typeof c !== 'string' && c.tag.toLowerCase() === 'begchr'
        ) as XmlNode | undefined;
        const endChr = (dPrNode.children || []).find(
          (c) => typeof c !== 'string' && c.tag.toLowerCase() === 'endchr'
        ) as XmlNode | undefined;
        if (begChr?.attrs) {
          beg = begChr.attrs.val || begChr.attrs['m:val'] || '(';
        }
        if (endChr?.attrs) {
          end = endChr.attrs.val || endChr.attrs['m:val'] || ')';
        }
      }

      const escapeChr = (c: string) => {
        if (c === '{') return '\\{';
        if (c === '}') return '\\}';
        if (c === '[') return '[';
        if (c === ']') return ']';
        if (c === '(') return '(';
        if (c === ')') return ')';
        return c;
      };

      const eLatex = eNode ? convertAll(eNode.children) : '';
      return `\\left${escapeChr(beg)} ${eLatex} \\right${escapeChr(end)}`;
    }
    case 'limlow': {
      const eNode = getChildByTag('e');
      const limNode = getChildByTag('lim');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      const limLatex = limNode ? convertAll(limNode.children) : '';
      return `\\lim_{${limLatex}} ${eLatex}`;
    }
    case 'limupp': {
      const eNode = getChildByTag('e');
      const limNode = getChildByTag('lim');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      const limLatex = limNode ? convertAll(limNode.children) : '';
      return `\\overset{${limLatex}}{${eLatex}}`;
    }
    case 'bar': {
      const eNode = getChildByTag('e');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      return `\\overline{${eLatex}}`;
    }
    case 'box': {
      const eNode = getChildByTag('e');
      const eLatex = eNode ? convertAll(eNode.children) : '';
      return `\\boxed{${eLatex}}`;
    }
    default:
      return convertAll(children);
  }
}

export function translateMathmlNode(node: XmlNode | string): string {
  if (typeof node === 'string') {
    return node;
  }
  const tag = node.tag.toLowerCase();
  const children = node.children || [];

  const convertAll = (nodes: (XmlNode | string)[]) =>
    nodes.map(translateMathmlNode).join('');

  switch (tag) {
    case 'math': {
      const isDisplay = node.attrs && node.attrs.display === 'block';
      return isDisplay ? `\n$$${convertAll(children)}$$\n` : `$${convertAll(children)}$`;
    }
    case 'mfrac': {
      const numLatex = children[0] ? translateMathmlNode(children[0]) : '';
      const denLatex = children[1] ? translateMathmlNode(children[1]) : '';
      return `\\frac{${numLatex}}{${denLatex}}`;
    }
    case 'msup': {
      const baseLatex = children[0] ? translateMathmlNode(children[0]) : '';
      const supLatex = children[1] ? translateMathmlNode(children[1]) : '';
      return `${baseLatex}^{${supLatex}}`;
    }
    case 'msub': {
      const baseLatex = children[0] ? translateMathmlNode(children[0]) : '';
      const subLatex = children[1] ? translateMathmlNode(children[1]) : '';
      return `${baseLatex}_${subLatex}`;
    }
    case 'msubsup': {
      const baseLatex = children[0] ? translateMathmlNode(children[0]) : '';
      const subLatex = children[1] ? translateMathmlNode(children[1]) : '';
      const supLatex = children[2] ? translateMathmlNode(children[2]) : '';
      return `${baseLatex}_{${subLatex}}^{${supLatex}}`;
    }
    case 'msqrt':
      return `\\sqrt{${convertAll(children)}}`;
    case 'mroot': {
      const baseLatex = children[0] ? translateMathmlNode(children[0]) : '';
      const idxLatex = children[1] ? translateMathmlNode(children[1]) : '';
      return `\\sqrt[${idxLatex}]{${baseLatex}}`;
    }
    case 'mfenced': {
      const open = (node.attrs && node.attrs.open) || '(';
      const close = (node.attrs && node.attrs.close) || ')';
      return `\\left${open} ${convertAll(children)} \\right${close}`;
    }
    case 'mi': {
      const text = convertAll(children).trim();
      if (text.length > 1 && !text.startsWith('\\')) {
        if (['sin', 'cos', 'tan', 'log', 'ln', 'lim', 'det', 'max', 'min'].includes(text)) {
          return `\\${text}`;
        }
        return `\\text{${text}}`;
      }
      const greek: Record<string, string> = {
        alpha: '\\alpha', beta: '\\beta', gamma: '\\gamma', delta: '\\delta',
        theta: '\\theta', pi: '\\pi', sigma: '\\sigma', omega: '\\omega',
        lambda: '\\lambda', mu: '\\mu', phi: '\\phi', psi: '\\psi'
      };
      const greekSymbol = greek[text.toLowerCase()];
      if (greekSymbol) return greekSymbol;
      return text;
    }
    case 'mn':
      return convertAll(children).trim();
    case 'mo': {
      const text = convertAll(children).trim();
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
      return `\\text{${convertAll(children)}}`;
    case 'mrow':
      return convertAll(children);
    case 'munder': {
      const base = children[0] ? translateMathmlNode(children[0]) : '';
      const under = children[1] ? translateMathmlNode(children[1]) : '';
      return `\\underset{${under}}{${base}}`;
    }
    case 'mover': {
      const base = children[0] ? translateMathmlNode(children[0]) : '';
      const over = children[1] ? translateMathmlNode(children[1]) : '';
      return `\\overset{${over}}{${base}}`;
    }
    case 'munderover': {
      const base = children[0] ? translateMathmlNode(children[0]) : '';
      const under = children[1] ? translateMathmlNode(children[1]) : '';
      const over = children[2] ? translateMathmlNode(children[2]) : '';
      return `${base}_{${under}}^{${over}}`;
    }
    default:
      return convertAll(children);
  }
}

export function convertHtmlMathToLatex(html: string): string {
  if (!html) return '';
  let work = html;

  // Process oMathPara
  const oMathParaRegex = /<(?:m:)?oMathPara\b[^>]*>([\s\S]*?)<\/(?:m:)?oMathPara>/gi;
  work = work.replace(oMathParaRegex, (match, content) => {
    const xml = `<oMathPara>${content}</oMathPara>`;
    try {
      const parsed = parseXml(xml);
      if (parsed && parsed.length) {
        return translateOmmlNode(parsed[0]);
      }
    } catch {
      // ignore
    }
    return match;
  });

  // Process oMath
  const oMathRegex = /<(?:m:)?oMath\b[^>]*>([\s\S]*?)<\/(?:m:)?oMath>/gi;
  work = work.replace(oMathRegex, (match, content) => {
    const xml = `<oMath>${content}</oMath>`;
    try {
      const parsed = parseXml(xml);
      if (parsed && parsed.length) {
        const latex = translateOmmlNode(parsed[0]);
        return `$${latex}$`;
      }
    } catch {
      // ignore
    }
    return match;
  });

  // Process MathML
  const mathmlRegex = /<math\b[^>]*>([\s\S]*?)<\/math>/gi;
  work = work.replace(mathmlRegex, (match, content) => {
    const xml = `<math>${content}</math>`;
    try {
      const parsed = parseXml(xml);
      if (parsed && parsed.length) {
        return translateMathmlNode(parsed[0]);
      }
    } catch {
      // ignore
    }
    return match;
  });

  return work;
}
