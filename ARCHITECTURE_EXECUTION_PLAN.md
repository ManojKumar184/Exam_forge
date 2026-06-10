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
| M5 | Merge QuestionBankPage and WorkspacePage | NOT_STARTED | P1 | High | Medium | src/pages/questions/QuestionBankPage.tsx, WorkspacePage.tsx |
| M6 | Merge staging edit modal with QuestionEditorForm | NOT_STARTED | P1 | Medium | Low | ImportCenterPage.tsx, QuestionEditorForm.tsx |
| M7 | Move upload logic from UploadQuestionsPage into ImportCenter | COMPLETED | P2 | Medium | Low | UploadQuestionsPage.tsx, ImportCenterPage.tsx |

---

## 4. High Risk Refactors

*Cross-cutting changes — require thorough testing and staged rollout.*

| ID | Task | Status | Priority | Effort | Risk | Files |
|---|---|---|---|---|---|---|
| H1 | Remove extraction evaluation framework | NOT_STARTED | P3 | Medium | High | backend/src/extraction/evaluation/*, fixtures/*, benchmark/* |
| H2 | Split dataStore into domain stores | COMPLETED | P2 | High | High | src/stores/dataStore.ts → 5 domain stores |
| H3 | Unify duplicate detection systems | NOT_STARTED | P2 | Medium | High | detectDuplicates.js, duplicateHash.js, backend validation |
| H4 | Consolidate all three preview systems | NOT_STARTED | P2 | Medium | Medium | RichContent.tsx, QuestionBankPage.tsx, ImportCenterPage.tsx |
| H5 | DB migration to remove deprecated fields | NOT_STARTED | P3 | Medium | High | Migration script + Question.js model |
| H6 | Replace all any types across frontend | NOT_STARTED | P3 | High | Medium | 20+ components |

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

### Phase 1: Quick Wins (Week 1)

| Sprint | Items | Days |
|---|---|---|
| Sprint 1 | S1, S7, S6 | Day 1 |
| Sprint 2 | S4, S5, S3, S2 | Day 2-3 |

### Phase 2: Ingestion Cleanup (Week 2-3)

| Sprint | Items | Days |
|---|---|---|
| Sprint 3 | M2, M3, M4 | Day 4-6 |
| Sprint 4 | M7, M1 | Day 7-10 |

### Phase 3: Frontend Consolidation (Week 3-5)

| Sprint | Items | Days |
|---|---|---|
| Sprint 5 | M6 | Day 11-12 |
| Sprint 6 | M5 | Day 13-16 |
| Sprint 7 | H4 | Day 17-20 |

### Phase 4: Architecture Deep Refactor (Week 6-8)

| Sprint | Items | Days |
|---|---|---|
| Sprint 8 | H2 | Day 21-25 |
| Sprint 9 | H3, H1 | Day 26-29 |
| Sprint 10 | H5, H6 | Day 30-33 |

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
