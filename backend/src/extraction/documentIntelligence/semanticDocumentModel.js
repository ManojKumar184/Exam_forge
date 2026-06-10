export const SOURCE_TYPES = Object.freeze({
  DOCX: 'docx',
  NATIVE_PDF: 'native_pdf',
  SCANNED_PDF: 'scanned_pdf',
  IMAGE: 'image',
  CLIPBOARD: 'clipboard',
  HTML: 'html',
});

export const BLOCK_TYPES = Object.freeze({
  PARAGRAPH: 'paragraph',
  LIST_ITEM: 'list_item',
  TABLE: 'table',
  IMAGE: 'image',
  EQUATION: 'equation',
  CAPTION: 'caption',
  HTML: 'html',
});

export function createSemanticDocument({ sourceType, sourceFile = null, blocks = [], metadata = {} }) {
  return {
    version: 'semantic-document/v1',
    sourceType,
    sourceFile,
    metadata,
    blocks: blocks.map((block, index) => normalizeBlock(block, index)),
  };
}

export function normalizeBlock(block, index) {
  return {
    id: block.id || `b${index + 1}`,
    type: block.type || BLOCK_TYPES.PARAGRAPH,
    text: block.text || '',
    html: block.html || null,
    order: block.order ?? index,
    page: block.page ?? null,
    section: block.section || 'General',
    numbering: block.numbering || null,
    indentation: block.indentation ?? null,
    style: block.style || null,
    table: block.table || null,
    images: block.images || [],
    equations: block.equations || [],
    captions: block.captions || [],
    roleHints: block.roleHints || [],
    confidenceHints: block.confidenceHints || {},
    raw: block.raw || null,
  };
}

export function semanticDocumentFromLegacyBlocks(blocks = [], sourceType, metadata = {}) {
  const semanticBlocks = [];

  for (const [index, block] of blocks.entries()) {
    if (block.passage) {
      semanticBlocks.push({
        type: BLOCK_TYPES.PARAGRAPH,
        text: block.passage,
        section: block.section,
        roleHints: ['passage'],
      });
    }

    semanticBlocks.push({
      type: block.hasTable ? BLOCK_TYPES.TABLE : BLOCK_TYPES.PARAGRAPH,
      text: (block.lines || []).join('\n'),
      html: block.html || null,
      section: block.section,
      table: block.renderingMetadata?.tables?.[0] || null,
      images: block.images || [],
      equations: block.questionLatex ? [{ format: 'latex', value: block.questionLatex }] : [],
      roleHints: ['question_candidate'],
      raw: { legacyBlockIndex: index, questionNumber: block.questionNumber },
    });

    for (const option of block.options || []) {
      semanticBlocks.push({
        type: BLOCK_TYPES.LIST_ITEM,
        text: option.text || '',
        section: block.section,
        images: option.image ? [option.image] : [],
        equations: option.latex ? [{ format: 'latex', value: option.latex }] : [],
        roleHints: ['option'],
        raw: { label: option.label },
      });
    }

    if (block.explanation) {
      semanticBlocks.push({
        type: BLOCK_TYPES.PARAGRAPH,
        text: block.explanation,
        section: block.section,
        roleHints: ['explanation'],
      });
    }
  }

  return createSemanticDocument({ sourceType, sourceFile: metadata.sourceFile, blocks: semanticBlocks, metadata });
}

export function semanticDocumentFromDocxStructure(structure, metadata = {}) {
  const blocks = [];
  for (const [index, paragraph] of (structure.paragraphs || []).entries()) {
    blocks.push({
      type: paragraph.isTable ? BLOCK_TYPES.TABLE : paragraph.numbering ? BLOCK_TYPES.LIST_ITEM : BLOCK_TYPES.PARAGRAPH,
      text: paragraph.text,
      section: paragraph.section,
      numbering: paragraph.numbering,
      style: paragraph.style || (paragraph.isSection ? 'section' : null),
      table: paragraph.tableModel || null,
      roleHints: paragraph.isSection ? ['section'] : [],
      order: index,
    });
  }
  return createSemanticDocument({
    sourceType: SOURCE_TYPES.DOCX,
    sourceFile: metadata.sourceFile,
    blocks,
    metadata: { ...metadata, tableCount: structure.tables?.length || 0 },
  });
}
