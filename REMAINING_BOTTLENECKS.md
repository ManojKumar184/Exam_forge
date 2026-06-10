# Remaining Bottlenecks Report

Generated for the enterprise ingestion refactor.

## Current Bottlenecks

| Area | Bottleneck | Impact | Recommended Next Step |
| --- | --- | --- | --- |
| Scanned PDFs | OCR currently depends on Tesseract and page rasterization quality | Low-quality scans may lose math, diagrams, and column order | Add a cloud OCR/layout provider adapter and compare against Tesseract in benchmarks |
| Native PDFs | `pdf-parse` provides limited layout semantics | Multi-column papers and tables can still arrive with weak reading order | Add a PDF layout extraction provider with coordinates, fonts, and image regions |
| Publisher metadata | No deep integration with publisher-specific answer-key metadata | Level 2 answer detection is mostly a placeholder unless metadata exists in source | Add per-publisher adapters for known coaching institute templates |
| MathType/OLE | DOCX OMML and MathML are handled, but legacy OLE MathType extraction is limited | Some old coaching documents may preserve equations as embedded objects/images only | Add OLE object extraction and MathType conversion snapshots |
| Semantic inference | Answer semantic inference is intentionally conservative | Ambiguous questions are marked `needs_review` instead of guessed | Add optional LLM/vision provider behind confidence gates and audit logs |
| Ground truth benchmarks | Real JEE/NEET/CBSE PDFs are represented by fixtures unless source documents are supplied | Metrics are useful for regression, not a final industry-grade accuracy claim | Add licensed/owned ground-truth papers with expected JSON outputs |

## Review Policy

Questions are marked `needs_review` when boundary, answer, explanation, math, classification, or validation confidence falls below production thresholds. This is deliberate: ExamForge should avoid silently publishing doubtful questions.
