# ExamForge Canonical Question System — Implementation Plan

This plan is grounded in the current `phase3-hardening` checkout and the canonical-question brief. It replaces the older performance-focused proposal; no confidence thresholds, caching, bulk writes, or worker pools are part of this scope unless measurement later demonstrates they are necessary.

## Current state

- `semantic-document/v1` already represents document-level source blocks in `backend/src/extraction/documentIntelligence/semanticDocumentModel.js`. It is an extraction input model, not a canonical Question model.
- `Question` stores parallel fields (`questionText`, `questionLatex`, images, `contentBlocks`, `semanticBlocks`, diagrams, formulas, and legacy answer/options fields). The rich renderer can display ordered text, equations, images, tables, and retained embedded objects.
- `QuestionEditorForm` maintains structured and legacy state together, but derives `question_text` by flattening only text/equation blocks. Manual creation and staged edits share that form; the separate editor route does too.
- DOCX extraction already reads OOXML structure and preserves OMML/OLE/image evidence. The document-intelligence pipeline converts that structure into segments and then legacy question objects. It does not send raw DOCX to a model.
- The current benchmark harness has synthetic fixtures and local DOCX inputs, but its report is stale and the harness's before/after comparison uses saved output rather than independent source ground truth. Existing source-oracle evaluation code is available and should be used where it applies.
- `@xenova/transformers` is declared, but there is no current local model inference provider found in `backend/src`; no model weights were confirmed in the repository. Deterministic classification is available. No worker pool was found to justify introducing one up front.

## Phases and acceptance checks

### 1. Canonical content contract and compatibility mapping

Define a versioned Question-content IR distinct from the document IR. It must preserve ordered paragraphs, inline/display equations, images, tables, embedded/unsupported objects, options and option content, explanation/answer provenance, source coordinates, and fidelity/review warnings. Add normalization and legacy adapters so old records remain readable and old API consumers keep their current fields. Avoid claiming a lossy legacy projection is canonical. Add round-trip and serialization tests, including OMML and OLE retention.

### 2. Server persistence and trust boundaries

Persist the canonical content field additively on `Question`, map it through API serialization, and validate shape/version on create/update. Keep tenant and review fields server-controlled with explicit payload allowlists. Verify bank, paper, export, and online-test consumers still receive their expected legacy fields while canonical content is preserved.

### 3. Ordered rich editing and manual entry

Make the existing editor operate on the canonical ordered blocks instead of flattening them into one HTML/plain-text string. Support inserting/editing text, equations, images, and tables using existing components and dependencies; preserve imported unsupported objects as read-only evidence with warnings. Apply the same editor path to manual entry and staged import. Add component or API-level tests for content round-trip and ordering.

### 4. Provenance and validation

Carry extraction provenance and fidelity into canonical content. Validate supported objective types, answer structure, required metadata, empty content, and unresolved/low-fidelity math/media. Ambiguous material stays `UNCLASSIFIED`/`needs_review`; do not infer a type or silently convert source content. Add tests for each review condition.

### 5. Ingestion integration and DOCX security

Map DOCX and clipboard/manual input into the canonical IR once, then adapt to legacy consumers. Preserve OOXML structure and source references; keep raw DOCX out of any model prompt. Review ZIP/XML size, entity, path, and embedded-object handling in the DOCX path and add focused adversarial fixtures without replacing extraction with a PDF-first flow.

### 6. Local normalization evaluation

Establish a repeatable, independent source-to-output benchmark using the existing evaluation modules and curated DOCX fixtures. Measure correctness, latency, CPU, and memory for the deterministic baseline. Inspect available compatible local models and weights; select one only if it is actually distributable/loadable in this environment and improves held-out results without changing source content. Keep any model an optional local normalization/classification aid with deterministic fallback and human review. No network inference or new model provider is assumed.

### 7. Lifecycle compatibility and regression coverage

Exercise canonical Questions through bank moderation, paper selection/export, and online exam rendering/scoring. Add end-to-end regression fixtures proving every supported structured block survives the lifecycle and is presented in source order. Use existing MongoDB integration infrastructure for persistence and tenant checks.

### 8. Documentation and final verification

Update only architecture, operations, and readiness documentation affected by delivered behavior. Run targeted backend tests, applicable MongoDB integration tests, frontend typecheck/build when the editor changes, the independent benchmark, secret scan, and final diff review. Report exact evidence, benchmark values, limitations, and unresolved infrastructure; do not claim production-ready without supporting evidence.

## Execution notes

- Preserve objective-only Core v1 approval and existing paper-level marks behavior.
- Prefer additive schema/API compatibility over one-shot migration of legacy Questions.
- Do not add a parsing worker pool unless measurements show CPU blocking that cannot be addressed by existing queued ingestion.
- Existing report output must not be treated as new benchmark evidence.
- Complete and test each phase before moving dependent flows to it.

## Progress in this worktree

- **Implemented foundations:** versioned Question content schema and legacy adapter; additive persistence and API projection; manual/staged payload allowlists; canonical rendering for stem/options/explanation; editor controls for stem text, equations, table cells, and image references; bounded DOCX archive parsing; removed the unmounted process-local classification workflow.
- **Partially implemented:** editor preserves rich option/explanation blocks and renders them, but does not yet offer complete structured editing for those blocks. Canonical fields flow through the Question API and paper export regression coverage exists, but a full database-backed question-bank → paper → online-test lifecycle test still requires MongoDB.
- **Not implemented:** a new local normalization model. This checkout has no model weights and no independent ground-truth benchmark dataset/runner to select a model safely. The deterministic ingestion path remains in place; do not interpret the stale synthetic report as accuracy evidence.
- **Verification limit:** the configured backend suite skips three MongoDB integration tests when `MONGODB_TEST_URI` is unset. Frontend typecheck and production build passed in this workspace.
