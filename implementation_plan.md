# Implementation Plan — High-Performance Ingestion & Local Classification

This plan details the phased steps to resolve structural extraction bugs, fix threshold-capping anomalies, introduce caching/bulk database operations, build benchmarking pipelines, and design local vector classification using ONNX to eliminate external API overhead.

---

## User Review Required

> [!IMPORTANT]
> **Confidence Threshold Adjustment:**
> To solve the "100% review rate" bug, we propose raising rules-based confidence caps to values that exceed the thresholds when a deterministic match is found (e.g., matching "Class 12" exactly gets `0.95` confidence instead of `0.70`). This avoids false-positive review warnings.
> 
> **Syllabus Caching Strategy:**
> Caching `SyllabusNode`s in RAM requires cache clearing whenever a node is created, updated, or deleted. We will add a hook to clear the in-memory cache upon write operations.

---

## Open Questions

> [!NOTE]
> **Dataset Selection for Benchmarking:**
> For Phase 2, we will need sample files containing roughly 100, 500, and 1,000 questions. If large files are not available, we can duplicate the provided `Physics_cleaned_dataset.docx` (43 questions) dynamically in memory inside the benchmark runner to simulate large-scale ingestion.

---

## Proposed Changes

### Phase 1: Ingestion Bugfixes & Database Optimizations

#### [MODIFY] [normalizeQuestions.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/src/extraction/normalizeQuestions.js)
* **CorrectAnswers Mapping**: Update the mapped output in `normalizeQuestions` (around line 672) to check for pre-extracted answers (`block.correctAnswers` or `correctOption`) from the deterministic parser, rather than depending only on the LLM's `pipeline.correctAnswers` field.
* **Explanation Preservation**: Confirm `block.explanation || pipeline.explanation || null` is consistently assigned.

#### [MODIFY] [classificationPipeline.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/src/ai/classificationPipeline.js)
* **Adjust Rules Caps**: Increase maximum confidence values in `computeFieldConfidence()` (lines 80-100) when deterministic rules return valid matches:
  * Class match: `0.95` (above the `0.90` threshold)
  * Subject match: `0.95` (above the `0.90` threshold)
  * Chapter match: `0.90` (above the `0.85` threshold)
  * Topic match: `0.85` (above the `0.80` threshold)
* **Adjust Field Thresholds**: Set slightly more lenient thresholds for descriptive/topic mappings.

#### [MODIFY] [syllabusCatalog.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/src/ai/syllabusCatalog.js)
* **In-Memory Caching**: Cache the output of `loadSyllabusCatalog()` in a global variable `let cachedCatalog = null`.
* **Cache Eviction**: Export a `clearSyllabusCache()` method.
* **Mongoose Hooks**: Bind `post('save')` and `post('remove')` middleware hooks in `SyllabusNode.js` to automatically invoke `clearSyllabusCache()` on node updates.

#### [MODIFY] [uploadService.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/src/services/uploadService.js)
* **Bulk Commits**: Refactor `commitStagedQuestions` (lines 873-925) to stack creation objects in an array and run `Question.insertMany(stagedDocs)` instead of firing sequential `Question.create()` queries inside a loop.

---

### Phase 2: Performance & Resource Profiling Harness

#### [NEW] [benchmark_ingest.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/scratch/benchmark_ingest.js)
* **Benchmark Script**: Add a test script that loads `Physics_cleaned_dataset.docx` (or replicates its content buffer to scale up to 100, 500, and 1,000 blocks).
* **Metrics to Profile**:
  * Total Ingestion Time (ms)
  * Chunk Processing Latency (ms)
  * Max Memory Heap Allocation (MB) via `process.memoryUsage()`
  * Event Loop Lag (ms) via `perf_hooks` monitor to measure block durations.
* **Execution**: Create a script that can be executed directly using `node backend/scratch/benchmark_ingest.js`.

---

### Phase 3: Local ONNX Classifier Design & CPU Lag Analysis

#### [NEW] [localEmbeddingProvider.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/src/ai/providers/localEmbeddingProvider.js)
* **Transformers Integration**: Draft a local provider module using `@huggingface/transformers` to load the ONNX-optimized `all-MiniLM-L6-v2` model in-memory.
* **Precomputed Vector Index**:
  * Build a startup routine that loads the syllabus cache, extracts embedding vectors for each chapter and topic node, and holds them in a local cache.
  * Implement local Cosine Similarity computation.
* **Thread Analysis**: Run a test benchmark to evaluate the impact of ONNX inference on Express main-thread event loop lag.

---

### Phase 4: Single-Pass Optimization & Worker Pool Implementation

#### [NEW] [parsingWorker.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/src/jobs/parsingWorker.js)
* **Piscina Thread Pool**: Define a task worker file that handles document ingestion and vector classification in separate CPU threads.
* **Express Decoupling**: Offload chunk execution from the Express process.

#### [MODIFY] [reconstructionPipeline.js](file:///c:/Users/manoj555/Desktop/Exam_forge/backend/src/extraction/reconstructionPipeline.js)
* **Fast-Path Parser**: Implement a conditional branch that skips Stage 1, 2, 5, and 6 reconstruction passes if elements have already been structured by the boundary detector.

---

## Verification Plan

### Automated Tests
Run the benchmarking script before and after Phase 1 changes to measure processing time and memory allocations:
```bash
node backend/scratch/benchmark_ingest.js --dataset=43
```
Confirm all tests pass and ensure no regressions on the physics dataset:
```bash
node tests/e2e_physics_test.mjs
```

### Manual Verification
* **Answer Validation**: Verify that uploads of `Physics_cleaned_dataset.docx` populate `correctAnswers` correctly on the UI staging screen without throwing review alerts.
* **CPU and Memory Logs**: Audit output statistics of the benchmark runs.
