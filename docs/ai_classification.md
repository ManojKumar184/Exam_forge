# Question classification and normalization (current behavior)

ExamForge's DOCX ingestion uses OOXML extraction, deterministic boundary reconstruction, answer-key mapping, and rule-based type classification. It does not require a cloud AI provider. NVIDIA, OpenAI, and other provider adapters are optional integrations and are not required for normal ingestion. The `@xenova/transformers` package is present, but no local model is loaded by the production ingestion path; no model selection or accuracy claim is made.

Supported objective types are `MCQ_SINGLE`, `MCQ_MULTIPLE`, `TRUE_FALSE`, `FILL_BLANK`, `NUMERICAL`, `NUMERICAL_INTEGER`, `MATCH_FOLLOWING`, and `ASSERTION_REASON`. Unsupported, descriptive, or ambiguous structures remain `UNCLASSIFIED` and require review. Approval also checks objective type, answer structure, content, and syllabus mapping.

The extractor preserves DOCX OOXML evidence including OMML, images, tables, and embedded/OLE data where recognized. Original extracted content remains the source of truth. The current classifier is heuristic; low-confidence content must be reviewed. The historical benchmark output under `backend/src/extraction/benchmark` is not an independent ground-truth evaluation and must not be used as an accuracy claim.

The old `/api/document-classification` workflow and its process-local `sessionMap` were removed because it was not mounted as an active production route. Document ingestion uses the persisted upload/staging workflow instead.

## Known limitations

- No local semantic model or syllabus embedding matcher is integrated.
- Classification and reconstruction need a manually labeled DOCX corpus and independent benchmark before accuracy is quantified.
- Full canonical rich-block editing and end-to-end lifecycle coverage are incomplete; retained unsupported blocks are review evidence, not proof of lossless export.
- Mongo-backed lifecycle regressions require `MONGODB_TEST_URI` pointed at a dedicated test database.
