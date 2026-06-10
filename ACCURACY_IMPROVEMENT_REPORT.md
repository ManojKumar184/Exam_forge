# Accuracy Improvement Report

Generated: 2026-06-09T13:09:46.546Z

## Before Accuracy

| Metric | Accuracy |
| --- | ---: |
| Question Detection Accuracy | 72.12% |
| Question Boundary Accuracy | 58.68% |
| Question Count Accuracy | 53.08% |
| Stem Accuracy | 75.13% |
| Option Detection Accuracy | 31.65% |
| Option Ordering Accuracy | 80.00% |
| Question Type Accuracy | 26.00% |
| Equation Preservation Accuracy | 42.58% |
| Image Preservation Accuracy | 74.43% |
| Table Preservation Accuracy | 78.77% |
| Overall Extraction Accuracy | 59.24% |


## After Accuracy

| Metric | Accuracy |
| --- | ---: |
| Question Detection Accuracy | 74.51% |
| Question Boundary Accuracy | 53.57% |
| Question Count Accuracy | 94.98% |
| Stem Accuracy | 57.70% |
| Option Detection Accuracy | 41.41% |
| Option Ordering Accuracy | 60.00% |
| Question Type Accuracy | 42.76% |
| Equation Preservation Accuracy | 67.89% |
| Image Preservation Accuracy | 73.62% |
| Table Preservation Accuracy | 78.85% |
| Overall Extraction Accuracy | 64.53% |


## Improvement Per Metric

| Metric | Before | After | Improvement |
| --- | ---: | ---: | ---: |
| Question Detection Accuracy | 72.12% | 74.51% | 2.38% |
| Question Boundary Accuracy | 58.68% | 53.57% | -5.11% |
| Question Count Accuracy | 53.08% | 94.98% | 41.90% |
| Stem Accuracy | 75.13% | 57.70% | -17.44% |
| Option Detection Accuracy | 31.65% | 41.41% | 9.77% |
| Option Ordering Accuracy | 80.00% | 60.00% | -20.00% |
| Question Type Accuracy | 26.00% | 42.76% | 16.76% |
| Equation Preservation Accuracy | 42.58% | 67.89% | 25.32% |
| Image Preservation Accuracy | 74.43% | 73.62% | -0.81% |
| Table Preservation Accuracy | 78.77% | 78.85% | 0.08% |
| Overall Extraction Accuracy | 59.24% | 64.53% | 5.29% |

## Remaining Bottlenecks

- equation_corruption: 24 cases across jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx. Source math signatures were not preserved in extracted stem/formula fields.
- lost_option: 22 cases across test_image1.png, jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx. Detected option count is lower than source option count.
- mcq_single_classified_as_descriptive: 19 cases across Physics.docx, Physics_cleaned_dataset.docx. Question type classifier disagreed with source structural cues.
- option_split: 14 cases across jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx. Detected option count is higher than source option count.
- missing_question: 12 cases across jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx. Source question had no aligned extracted object above semantic threshold.
- image_detachment: 12 cases across jee_mains.pdf, Physics.docx, Physics_cleaned_dataset.docx. Source references a figure/diagram but extracted object has no image association.
- numerical_classified_as_descriptive: 6 cases across Physics.docx, Physics_cleaned_dataset.docx. Question type classifier disagreed with source structural cues.
- stem_mismatch: 5 cases across test_image1.png, Physics.docx, Physics_cleaned_dataset.docx. Semantic comparison below threshold.
- wrong_question_boundary: 2 cases across test_image1.png, Physics_cleaned_dataset.docx. Question start/end reconstruction merged or split adjacent semantic content.
- extra_question: 2 cases across jee_mains.pdf, Physics.docx. Semantic comparison below threshold.
