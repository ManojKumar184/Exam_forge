# Exam Forge — Architecture Changelog

> Persistent walkthrough of every architectural change.
> One entry per completed task. Updated after every execution.

---

## Change Entry 001

**Date:** 2026-06-10
**Sprint:** Audit Phase
**Task:** Complete Architecture Audit & Roadmap Creation

**Files Modified:**
- `ARCHITECTURE_EXECUTION_PLAN.md` (created)
- `ARCHITECTURE_CHANGELOG.md` (created)

**Reason:**
Initial architecture audit was conducted across the entire codebase to identify duplicate functionality, dead code, unused APIs, conflicting workflows, and technical debt. The audit produced 20 recommendations across three risk categories. These two governance documents were created to track and manage the refactor lifecycle.

**Implementation:**
1. Performed full codebase exploration across all backend and frontend directories
2. Identified duplicate extraction pipelines, duplicate UI pages, duplicate preview/edit systems
3. Traced image pipeline through all 8 ingestion stages
4. Audited Question model for unused fields, legacy fields
5. Audited frontend for dead pages, duplicate forms, duplicate state management
6. Produced 20 actionable recommendations sorted into Safe, Moderate, High Risk categories
7. Created ARCHITECTURE_EXECUTION_PLAN.md as single source of truth for the roadmap
8. Created ARCHITECTURE_CHANGELOG.md to track every executed change

**Audit Findings Summary:**

| Category | Count |
|---|---|
| Safe Refactors (zero risk) | 7 |
| Moderate Refactors (low risk) | 7 |
| High Risk Refactors | 6 |
| **Total Recommendations** | **20** |

**Key Duplications Found:**
- Two extraction pipelines (legacy + documentIntelligence) both active
- Two answer detectors (answerDetector.js + answerDetectionEngine.js)
- Two explanation detectors (explanationDetector.js + explanationDetectionEngine.js)
- Two question list/edit pages (QuestionBankPage + WorkspacePage)
- Three question preview systems (RichContent + QuestionBankPage modal + ImportCenterPage modal)
- Two staging edit systems (custom modal in ImportCenterPage + QuestionEditorForm)
- Dead UploadQuestionsPage.tsx never imported anywhere
- 11+ dead extraction test/debug scripts
- 6 unused Question model fields
- Residual Gemini/Ollama references from deleted providers

**Impact:**
- ARCHITECTURE_EXECUTION_PLAN.md establishes the refactor roadmap for 6-8 weeks
- All 20 tasks are tracked with status, priority, effort, risk, dependencies, rollback plans
- Four implementation phases defined: Quick Wins → Ingestion Cleanup → Frontend Consolidation → Deep Refactor

**Testing Performed:**
- Manual verification of file imports and references for dead code detection
- grep/searched across entire codebase for each candidate file/field
- Verified legacy pipeline toggle point (`useLegacyExtraction`)
- Verified dead model fields against all writes/reads in the codebase

**Result:** SUCCESS — Audit complete, roadmap documented.

**Notes:**
- No implementation changes made during audit phase
- Phase 1 (Quick Wins) is ready to begin — all 7 Safe Refactors are P0 priority, zero risk
- The execution plan can be updated as priorities shift

---

## Change Entry 002

**Date:** 2026-06-10
**Sprint:** Phase 1 / Sprint 1
**Task:** S1 — Remove UploadQuestionsPage.tsx (dead page)

**Files Modified:**
- `src/pages/questions/UploadQuestionsPage.tsx` (deleted)
- `ARCHITECTURE_EXECUTION_PLAN.md` (S1 status: NOT_STARTED → IN_PROGRESS → COMPLETED)
- `ARCHITECTURE_CHANGELOG.md` (this entry)

**Reason:**
`UploadQuestionsPage.tsx` was never imported or used anywhere in the codebase. It was a dead page with no route registration. Its file upload logic was already duplicated in `ImportCenterPage.tsx`, which has its own `uploadFiles` function using the same `uploadQuestionFileApi`. The page also contained a polling diagnostics UI (cache header analysis, polling attempt tracking) that was never rendered because the page was unreachable.

**Implementation:**
1. Verified zero imports of `UploadQuestionsPage` across all `.tsx`, `.ts`, `.js` files
2. Verified `ImportCenterPage.tsx` already handles file uploads (duplicate code exists)
3. Deleted `src/pages/questions/UploadQuestionsPage.tsx`
4. Verified no other file references the component
5. Ran full TypeScript typecheck — 0 errors
6. Updated execution plan status

**Testing:**
- Full TypeScript compilation check: `npx tsc --noEmit --pretty` — 0 errors
- Code search for `UploadQuestionsPage` across entire codebase — only match was its own export
- Verified ImportCenterPage has equivalent upload functionality

**Result:** SUCCESS — File removed, build clean, no functionality lost.

**Rollback:** `git restore src/pages/questions/UploadQuestionsPage.tsx`


## Change Entry 003

**Date:** 2026-06-10
**Sprint:** Phase 1 / Sprint 1
**Task:** S7 — Remove semanticDuplicates.js (inline into detectDuplicates.js)

**Files Modified:**
- `backend/src/extraction/semanticDuplicates.js` (deleted)
- `backend/src/extraction/detectDuplicates.js` (inlined findSemanticDuplicate locally)
- `ARCHITECTURE_EXECUTION_PLAN.md` (S7 status: NOT_STARTED → IN_PROGRESS → COMPLETED)
- `ARCHITECTURE_CHANGELOG.md` (this entry)

**Reason:**
semanticDuplicates.js contained a single exported function (`findSemanticDuplicate`) that was only imported by `detectDuplicates.js`. All of its imports (`combinedTextSimilarity`, `equationSimilarity`, `findDuplicateCandidate`, `computeDuplicateHash`) were already imported by `detectDuplicates.js`. Inlining eliminates an unnecessary module boundary.

**Implementation:**
1. Copied `findSemanticDuplicate` function and its constants (SEMANTIC_THRESHOLD=0.88, EQUATION_THRESHOLD=0.85) into `detectDuplicates.js` as a local non-exported function
2. Removed the `import { findSemanticDuplicate } from './semanticDuplicates.js'` line
3. Deleted `backend/src/extraction/semanticDuplicates.js`
4. Verified TypeScript compilation — 0 errors

**Testing:**
- Full TypeScript check: `npx tsc --noEmit --pretty` — 0 errors
- Verified no other file imports semanticDuplicates.js (only detectDuplicates.js did)
- All imports were already present in detectDuplicates.js — no new import lines needed

**Result:** SUCCESS — Module flattened, build clean, no logic changes.

**Rollback:** `git restore backend/src/extraction/detectDuplicates.js backend/src/extraction/semanticDuplicates.js`


## Change Entry 004

**Date:** 2026-06-10
**Sprint:** Phase 1 / Sprint 1
**Task:** S6 — Remove dead extraction scripts (10 files)

**Files Modified:**
- `backend/src/extraction/debug_q4.js` (deleted)
- `backend/src/extraction/inspect.js` (deleted)
- `backend/src/extraction/test_dataset_docx.js` (deleted)
- `backend/src/extraction/test_docx_load.js` (deleted)
- `backend/src/extraction/validate_dataset.js` (deleted)
- `backend/src/extraction/verify_blocks.js` (deleted)
- `backend/src/extraction/verify_browser.js` (deleted)
- `backend/src/extraction/stressTestHarness.js` (deleted)
- `backend/src/extraction/equationRegression.js` (deleted)
- `backend/src/extraction/mathRegression.js` (deleted)
- `ARCHITECTURE_EXECUTION_PLAN.md` (S6 status updated + corrected file count)
- `ARCHITECTURE_CHANGELOG.md` (this entry)

**Reason:**
All 10 files were debug/test scripts with zero imports across the entire codebase. The original audit listed 11 files, but `templateValidator.js` was verified as actively exported from `extraction/index.js` and was excluded.

**Implementation:**
1. Verified each file has zero imports across all .js, .ts, .tsx files
2. Excluded `templateValidator.js` (actively exported from index.js)
3. Deleted all 10 confirmed-dead files
4. Ran full TypeScript typecheck — 0 errors

**Testing:**
- Code search for each filename across entire codebase — no import references found
- Checked extraction/index.js exports — no exports for any of the 10 files
- Full TypeScript check: npx tsc --noEmit --pretty — 0 errors

**Result:** SUCCESS — 10 files (~2000+ lines) of dead code removed, build clean, no logic changes.

**Rollback:** git restore backend/src/extraction/*.js

