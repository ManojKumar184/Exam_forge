# ExamForge Document Intelligence Quality Report

Generated: 2026-06-08T15:20:24.945Z

## Architecture Coverage

| Stage | Status |
| --- | --- |
| Stage 0 Source detection | Implemented for DOCX, native PDF, scanned PDF, image, clipboard, HTML |
| Stage 1 Semantic document model | Implemented with paragraphs, lists, tables, images, equations, styles, numbering |
| Stage 2 Boundary detection | Deterministic structure-first detector with numbering, style, table, option, answer, passage signals |
| Stage 3 Classification | Implemented after reconstruction for MCQ, MSQ, numerical, integer, assertion-reason, match, matrix, comprehension, subjective |
| Stage 4 Answer detection | Implemented with confidence levels for explicit labels, tables, annotations, fallback review |
| Stage 5 Explanation detection | Implemented for multi-block solution/explanation/reason content |
| Stage 6 Math preservation | Integrated with existing OMML/MathML/LaTeX pipeline and confidence scoring |
| Stage 7 Image linking | Integrated with existing DOCX/HTML media mapping and semantic block links |
| Stage 8 Validation | Implemented before persistence with review fallback |
| Stage 9 Confidence | Implemented per boundary, answer, explanation, math, classification, validation |
| Stage 10 Benchmarks | Implemented synthetic plus JEE Main, JEE Advanced, NEET, CBSE fixtures |

## Benchmark Accuracy

| Category | Passed | Total | Accuracy |
| --- | ---: | ---: | ---: |
| JEE Main | 1 | 1 | 100.0% |
| JEE Advanced | 0 | 1 | 0.0% |
| NEET | 1 | 1 | 100.0% |
| CBSE | 1 | 1 | 100.0% |
| MCQ | 1 | 1 | 100.0% |
| MSQ | 1 | 1 | 100.0% |
| Numerical | 1 | 1 | 100.0% |
| Descriptive | 1 | 1 | 100.0% |
| Assertion Reason | 1 | 1 | 100.0% |
| Match Following | 1 | 1 | 100.0% |
| Comprehension | 1 | 1 | 100.0% |
| Tables | 1 | 1 | 100.0% |
| Images | 1 | 1 | 100.0% |
| Equations | 1 | 1 | 100.0% |
| Overall | 13 | 14 | 92.9% |

## Real Document Metrics

| Metric | Physics.docx | Physics_cleaned_dataset.docx |
| --- | ---: | ---: |
| Extracted questions | 35 | 32 |
| Options extracted | 94 | 95 |
| Questions with answers | 1 | 2 |
| Questions with explanations | 0 | 32 |
| Questions with tables | 1 | 1 |
| Questions with equations | 0 | 32 |
| Questions with images | 0 | 1 |
| Review required | 35 | 32 |
