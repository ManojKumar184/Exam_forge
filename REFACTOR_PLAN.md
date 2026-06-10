# Exam Forge Ingestion System — Analysis & Migration Plan

## Phase 1: Codebase Analysis

### Architecture Overview

The ingestion pipeline lives in `backend/src/extraction/` with dual routing:
- Legacy pipeline: extractDocxQuestions → normalizeQuestions → reconstructionPipeline (13 stages)
- Document Intelligence pipeline: sourceDetection → semanticDocument → boundaryDetector → answerDetection → explanationDetection → classify → validate

AI classification in `backend/src/ai/`: Three-tier (rules → semantic → HuggingFace API LLM)
Models: SyllabusNode (hierarchical), Subject/Topic/ExamType (legacy flat), Question (comprehensive)
Upload workflow: Extract → stage → review → commit to Question

### Strengths
1. DOCX parsing with equation extraction (OMML/MathML → LaTeX)
2. Robust option parsing (reverse-scan, inline, multi-format: A., (A), ①, I., etc.)
3. SyllabusNode hierarchy already exists (exam_pattern→class→subject→chapter→topic→subtopic)
4. Already uses HuggingFace Inference API (no local models) ✓
5. Upload staging with review workflow, reprocessing, duplicate detection
6. Comprehensive Question schema with syllabusMappings field already defined
7. Mature Paper generation, Test taking, Grading services

### Weaknesses
1. Two parallel pipelines create confusion and maintenance burden
2. Question types duplicated: old (mcq, numerical) vs new (MCQ_SINGLE, NUMERICAL)
3. Numerical and Integer still separate (spec requires merged NUMERICAL_INTEGER)
4. Classification produces free-text hints — NOT constrained to SyllabusNode tree
5. Metadata classifier uses old Subject/Topic models instead of SyllabusNode
6. 13-stage reconstruction pipeline has excessive diagnostic overhead
7. No centralized validation layer — validation scattered across files
8. Answer/Explanation detection engines not integrated with main pipeline

## Phase 2: Migration Plan (5 Sprints)

### Sprint 1: Foundation (Non-breaking)
1. Expand Question model enum: add NUMERICAL_INTEGER, MATCH_FOLLOWING, SHORT_ANSWER, LONG_ANSWER, MCQ_MULTIPLE
2. Create centralized validationEngine.js with structured rules
3. Update detectQuestionType.js: merge NUMERICAL+INTEGER → NUMERICAL_INTEGER
4. Update normalizeQuestions.js for canonical type mapping

### Sprint 2: Classification + Syllabus
5. Update HuggingFace provider prompt to include SyllabusNode tree
6. Add SyllabusNode-matching post-processor to classification pipeline
7. Store results in syllabusMappings field (already in schema!)
8. Update upload workflow for syllabus-constrained classification

### Sprint 3: DOCX Optimization
9. Optimize for Physics_cleaned_dataset.docx template (Q1., Q22., Part→Topic→Type hierarchy)
10. Validate against template

### Sprint 4: Pipeline Consolidation
11. Integrate answer/explanation detection engines
12. Simplify 13-stage pipeline (reduce diagnostic overhead)
13. Clean up parallel pipeline overlap

### Sprint 5: Validation + Polish
14. Integrate validation layer into upload workflow
15. Update frontend for validation status display
16. Run end-to-end validation

## Backward Compatibility
- All existing API endpoints unchanged
- Question model enum EXPANDED only (old types remain valid)
- Paper generation, test taking, grading unaffected
- Existing questions keep original types (migration optional)

## Validation
- Run validationHarness.js against Physics_cleaned_dataset.docx
- Verify question count, type distribution, option alignment
- Run verify_test_flow.cjs for end-to-end
