# Exam Forge — Architecture Execution Plan

> **Single source of truth for the refactor roadmap.**
> All implementation work must update this file before and after execution.

---

## Status Legend

| Status | Meaning |
|---|---|
| `NOT_STARTED` | Task has not been started |
| `IN_PROGRESS` | Task is currently being worked on |
| `COMPLETED` | Task has been implemented and verified |
| `SKIPPED` | Task was evaluated and intentionally skipped |
| `ROLLED_BACK` | Task was implemented but rolled back due to issues |

---

## 1. Architecture Overview

### Backend Structure

```
backend/src/
  routes/           → 15 route files (50+ endpoints)
  controllers/      → 14 controllers (thin wrappers)
  services/         → 11 services (business logic)
  models/           → 16 Mongoose models
  extraction/       → 30+ files (ingestion pipeline)
  ai/               → 7 files (classification)
  utils/            → 10 files (mappers, helpers)
  generators/       → 2 files (export)
  ocr/              → 4 files (Tesseract OCR)
  middleware/       → 5 files (auth, validation)
  validators/       → 5 files (Zod schemas)
  jobs/             → 3 files (background workers)
```

### Frontend Structure

```
src/
  pages/            → 20+ page components
  components/       → 15+ shared components
  stores/           → 2 Zustand stores (authStore, dataStore)
  api/              → 10 API client modules
  utils/            → 12 utility modules
  types/            → 1 type definition file
```

### Data Flow

```
DOCX/PDF/Image → extraction/* → normalizeQuestions → reconstructionPipeline
                                    ↓
                              AI Classification (rules + optional HF)
                                    ↓
                              Upload Service → Staging → Workspace → Bank
```

### Core Product Workflow

```
Question Creation (DOCX / Clipboard / Manual / Screenshot)
      ↓
Question Classification (AI → Syllabus Mapping)
      ↓
Question Bank (Storage + Review + Approval)
      ↓
Assessment Generation (Filter + Selection → Paper)
      ↓
Paper Export (DOCX / PDF)   AND/OR   Online Test
      ↓
Student Attempt → Results → Analytics
```

---

## 2. Safe Refactors

*Zero production logic changes. Removal of dead code, unused fields, unused imports.*

| ID | Task | Status | Priority | Effort | Risk | Files |
|---|---|---|---|---|---|---|
| S1 | Remove UploadQuestionsPage.tsx | COMPLETED | P0 | Low | None | src/pages/questions/UploadQuestionsPage.tsx |
| S2 | Remove dead Question model fields | COMPLETED | P0 | Low | None | backend/src/models/Question.js |
| S3 | Remove subtopicId from syllabus mappings | COMPLETED | P0 | Low | None | backend/src/models/Question.js |
| S4 | Fix duplicate /catalog/chapters API | COMPLETED | P0 | Low | None | Route + controller files |
| S5 | Remove residual Gemini/Ollama references | COMPLETED | P0 | Low | None | backend/src/services/questionReconstructService.js, validators |
| S6 | Remove dead extraction scripts | COMPLETED | P0 | Low | None | 10 scripts in backend/src/extraction/ |
| S7 | Remove semanticDuplicates.js | COMPLETED | P0 | Low | None | backend/src/extraction/semanticDuplicates.js |

---

## 3. Moderate Refactors

*Logic changes but narrow scope — easy to verify and roll back.*

| ID | Task | Status | Priority | Effort | Risk | Files |
|---|---|---|---|---|---|---|
| M1 | Remove legacy extraction path | COMPLETED | P1 | High | Medium | backend/src/extraction/index.js, pipeline files |
| M2 | Consolidate duplicate answer detectors | DEFERRED | P1 | Medium | Low | answerDetector.js + answerDetectionEngine.js |
| M3 | Consolidate duplicate explanation detectors | DEFERRED | P1 | Medium | Low | explanationDetector.js + explanationDetectionEngine.js |
| M4 | Replace any types in key services | COMPLETED | P2 | Medium | Low | backend/src/services/*.js |
| M5 | Merge QuestionBankPage and WorkspacePage | COMPLETED | P1 | High | Medium | src/pages/questions/QuestionBankPage.tsx, WorkspacePage.tsx |
| M6 | Merge staging edit modal with QuestionEditorForm | COMPLETED | P1 | Medium | Low | ImportCenterPage.tsx, QuestionEditorForm.tsx |
| M7 | Move upload logic from UploadQuestionsPage into ImportCenter | COMPLETED | P2 | Medium | Low | UploadQuestionsPage.tsx, ImportCenterPage.tsx |

---

## 4. High Risk Refactors

*Cross-cutting changes — require thorough testing and staged rollout.*

| ID | Task | Status | Priority | Effort | Risk | Files |
|---|---|---|---|---|---|---|
| H1 | Remove extraction evaluation framework | COMPLETED | P3 | Medium | High | backend/src/extraction/evaluation/*, fixtures/*, benchmark/* |
| H2 | Split dataStore into domain stores | COMPLETED | P2 | High | High | src/stores/dataStore.ts → 5 domain stores |
| H3 | Unify duplicate detection systems | COMPLETED | P2 | Medium | High | detectDuplicates.js, duplicateHash.js, backend validation |
| H4 | Consolidate all three preview systems | COMPLETED | P2 | Medium | Medium | RichContent.tsx, QuestionBankPage.tsx, ImportCenterPage.tsx |
| H5 | DB migration to remove deprecated fields | DEFERRED | P3 | Medium | High | Migration script + Question.js model |
| H6 | Replace all any types across frontend | DEFERRED | P3 | High | Medium | 20+ components |

---

## 5. Priority Ranking

Ordered from highest value / lowest risk → lowest value / highest risk.

| Rank | ID | Task | Value | Risk | Effort | Phase |
|---|---|---|---|---|---|---|
| 1 | S1 | Remove dead UploadQuestionsPage | High | None | Low | Phase 1 |
| 2 | S7 | Remove semanticDuplicates.js | High | None | Low | Phase 1 |
| 3 | S6 | Remove dead extraction scripts | High | None | Low | Phase 1 |
| 4 | S4 | Fix duplicate catalog API | High | None | Low | Phase 1 |
| 5 | S5 | Remove Gemini/Ollama references | High | None | Low | Phase 1 |
| 6 | S3 | Remove subtopicId from schema | High | None | Low | Phase 1 |
| 7 | S2 | Remove dead Question model fields | High | None | Low | Phase 1 |
| 8 | M2 | Consolidate answer detectors | High | Low | Med | Phase 2 |
| 9 | M3 | Consolidate explanation detectors | High | Low | Med | Phase 2 |
| 10 | M4 | Replace any types (services) | Med | Low | Med | Phase 2 |
| 11 | M7 | Migrate upload logic | Med | Low | Med | Phase 2 |
| 12 | M1 | Remove legacy extraction path | High | Med | High | Phase 2 |
| 13 | M6 | Merge staging edit modal | High | Low | Med | Phase 3 |
| 14 | M5 | Merge QuestionBank & Workspace pages | High | Med | High | Phase 3 |
| 15 | H4 | Consolidate preview systems | Med | Med | Med | Phase 3 |
| 16 | H2 | Split dataStore into domain stores | High | High | High | Phase 4 |
| 17 | H3 | Unify duplicate detection | Med | High | Med | Phase 4 |
| 18 | H1 | Remove evaluation framework | Low | High | Med | Phase 4 |
| 19 | H5 | DB migration | Med | High | Med | Phase 4 |
| 20 | H6 | Replace all any types (frontend) | Low | Med | High | Phase 4 |

---

## 6. Implementation Phases

### Phase 1: Quick Wins ✅ COMPLETE

| Sprint | Items | Days | Status |
|---|---|---|---|
| Sprint 1 | S1, S7, S6 | Day 1 | ✅ DONE |
| Sprint 2 | S4, S5, S3, S2 | Day 2-3 | ✅ DONE |

### Phase 2: Ingestion Cleanup ✅ COMPLETE

| Sprint | Items | Days | Status |
|---|---|---|---|
| Sprint 3 | M4 (M2, M3 deferred) | Day 4-6 | ✅ DONE |
| Sprint 4 | M7, M1 | Day 7-10 | ✅ DONE |

### Phase 3: Frontend Consolidation ✅ COMPLETE

| Sprint | Items | Days | Status |
|---|---|---|---|
| Sprint 5 | M5, M6, H4 | Day 11-20 | ✅ DONE |

### Phase 4: Architecture Deep Refactor ✅ COMPLETE

| Sprint | Items | Days | Status |
|---|---|---|---|
| Sprint 6 | H1, H2, H3 | Day 21-29 | ✅ DONE |
| — | H5, H6 | Deferred | ⏸️ DEFERRED |

---

## 7. Dependencies Map

```
S1 ──→ M7 (move upload logic before deleting page)
         └─→ M6 (can run in parallel)
         └─→ M5 (independent)

S2 ──→ H5 (remove model fields → migration can be separate)
         └─→ No dependency on ingestion

S3 ──→ No dependencies

S4 ──→ No dependencies

S5 ──→ No dependencies

S6 ──→ Verify no runtime imports first

S7 ──→ No dependencies

M1 ──→ M2, M3 (may eliminate one file each naturally)
         └─→ Depends on v

---

## 8. Product Workflow Improvements

> **New roadmap section.** Priority-ordered product workflow improvements that directly impact user experience, accuracy, and platform reliability.

### Priority Ranking

| Rank | Area | Impact | Effort | Risk |
|---|---|---|---|---|
| 1 | AI Classification Validation | High — directly affects question routing accuracy | Medium | Low |
| 2 | Review Workflow | High — core moderation UX for faculty | Medium | Low |
| 3 | Assessment Generation | High — paper creation is the primary output | High | Medium |
| 4 | Paper Export Quality | Medium — affects final deliverable quality | Medium | Low |
| 5 | Online Test Workflow | Medium — student-facing experience | High | Medium |

---

## 9. Workflow Implementation Plans

### 9.1 AI Classification Validation

**Goal:** Improve the accuracy and reliability of the AI question classification pipeline so that questions are routed to the correct subject, class, chapter, exam type, and difficulty level with minimal human correction.

#### Current state

The pipeline (`classificationPipeline.js`) runs three layers:
1. **Rules provider** (`rulesProvider.js` → `metadataClassifier.js`) — keyword/pattern-based classification. Always runs. ~30% confidence baseline.
2. **Semantic tagging** (`semanticTagging.js`) — fuzzy name matching against catalog. Runs parallel to rules.
3. **LLM provider** (`huggingFaceProvider.js`) — only invoked when rules are uncertain (confidence < 70% or unknown question type). Falls back to rules if all 5 HF models fail.

Results are merged in `mergeClassification()` which prioritizes: rules > semantic > LLM for IDs. LLM hints are used for syllabus mapping resolution.

#### Known issues
1. **No validation feedback loop** — classification quality is never measured. No ground-truth labels, no accuracy tracking, no regression detection.
2. **Confidence scoring is naive** — simple average of provider confidences. No weighted ensemble, no per-field confidence.
3. **Syllabus mapping is names-only** — resolves by string matching hint names to syllabus tree nodes. No fallback or fuzzy matching for near-misses.
4. **LLM fallback is silent** — when all 5 HF models fail, the pipeline silently falls back to rules-only with no indication to the user.
5. **No user correction capture** — when faculty manually correct a classification in the workspace/bank, that correction is never fed back into the system.

#### Proposed implementation

**Sprint A — Accuracy Baseline** (effort: Low)

| Task | Description | Files |
|---|---|---|
| A1 | Track per-field accuracy: log classification decisions vs eventual user corrections. Store in a `classification_audit` collection or log file. | New utility + hook into questionService.updateQuestion / workspace approval |
| A2 | Add `/admin/classification-stats` endpoint: returns accuracy %, confusion matrix per field (class, subject, chapter, difficulty), per-provider stats. | New route + controller |
| A3 | Build a simple dashboard view (admin-only) showing accuracy metrics over time. | New page or admin tab |

**Sprint B — Confidence & Fallback Improvements** (effort: Medium)

| Task | Description | Files |
|---|---|---|
| B1 | Replace naive confidence average with weighted ensemble: rules=0.25, semantic=0.35, LLM=0.40. Per-field confidence tracking (subject confidence != difficulty confidence). | classificationPipeline.js — mergeClassification() |
| B2 | Add user-visible fallback indicator: when LLM fails, include a warning in `extractionWarnings` so faculty know the classification is rules-only. | classificationPipeline.js, HuggingFaceProvider |
| B3 | Add fuzzy syllabus matching: if exact name match fails, try Levenshtein or token-coverage fallback before giving up. | syllabusCatalog.js — resolveHintsToSyllabusMappings() |
| B4 | Add per-field minimum confidence thresholds: flag fields where confidence is below 0.5 for human review even if overall score is acceptable. | mergeClassification() |

**Sprint C — Feedback Loop** (effort: Medium)

| Task | Description | Files |
|---|---|---|
| C1 | Capture user corrections: when faculty change a question's subject/class/chapter in the workspace or bank, log the original AI prediction vs the corrected value. | questionService.js, WorkspacePage, QuestionBankPage |
| C2 | Store corrections in a `ClassificationCorrection` model: questionId, original fields, corrected fields, correctedBy, timestamp. | New Mongoose model |
| C3 | Add accuracy report generation: compare predictions against corrections, produce per-provider accuracy stats. | analyticsService.js |
| C4 | Optional: periodic retraining trigger — if accuracy drops below threshold for any provider, flag for admin review. | Background job or webhook |

**Sprint D — UI for Review & Correction** (effort: High)

| Task | Description | Files |
|---|---|---|
| D1 | Add classification confidence badges to QuestionPreviewModal and QuestionBankPage list view. Show per-field confidence (class, subject, chapter, difficulty) in a tooltip or expanded row. | QuestionPreviewModal.tsx, QuestionList.tsx |
| D2 | Create a "Classification Review" queue (separate from Moderation Queue): filters questions by low confidence or recent corrections needed. | New page or tab in ModerationQueuePage |
| D3 | Add inline correction workflow: faculty can correct classification fields directly from the review queue with one click. Batch corrections for similar issues. | Same page |
| D4 | Show accuracy history per faculty user: how often their corrections align with AI predictions. Gamify or provide feedback. | LeaderboardPage or admin view |

#### Success metrics

| Metric | Current (estimated) | Target |
|---|---|---|
| Subject accuracy | ~60% (rules-only) | >85% |
| Class accuracy | ~70% | >90% |
| Difficulty accuracy | ~50% | >75% |
| Syllabus mapping match rate | ~40% (exact name only) | >80% (with fuzzy) |
| User corrections captured | 0% (none tracked) | >90% of corrections saved |
| Time to first accurate classification | Immediate (always runs) | <2s per question |

---