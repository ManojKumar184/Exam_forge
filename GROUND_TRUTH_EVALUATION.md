# Ground Truth Evaluation

Generated: 2026-06-09T13:09:46.421Z

## Methodology

This framework reads each original source document with an independent source-observation reader, extracts Question Objects with ExamForge ingestion, aligns source candidates to extracted objects by semantic token/LCS similarity, and scores structure-preserving metrics. It does not compare parser output to itself and does not use simple string equality for correctness.

For images, the source observation is OCR-based because the original source is raster. That makes image evaluations useful for ingestion regression, but they still require human-labeled answer keys for final certification.

## Dataset Coverage

| File | Source Questions | Extracted Questions | Source Reader | Extraction Mode |
| --- | ---: | ---: | --- | --- |
| test_image1.png | 1 | 1 | tesseract_source_observation | image_semantic_pipeline |
| test_image2.png | 1 | 1 | tesseract_source_observation | image_semantic_pipeline |
| jee_mains.pdf | 1 | 1 | pdf_parse_embedded_text | native_pdf_semantic_pipeline |
| Physics.docx | 42 | 39 | mammoth_raw_text_and_html | docx_semantic_pipeline |
| Physics_cleaned_dataset.docx | 39 | 32 | mammoth_raw_text_and_html | docx_semantic_pipeline |

## Metrics

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


## Per-Question Results

### test_image1.png

| Question ID | Boundary | Stem | Options | Ordering | Type | Equation | Image | Table |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| test_image1.png::source::1 | FAIL | FAIL | FAIL | FAIL | PASS | PASS | PASS | PASS |

### test_image2.png

| Question ID | Boundary | Stem | Options | Ordering | Type | Equation | Image | Table |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| test_image2.png::source::1 | PASS | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |

### jee_mains.pdf

| Question ID | Boundary | Stem | Options | Ordering | Type | Equation | Image | Table |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| jee_mains.pdf::source::1 | FAIL | FAIL | FAIL | PASS | FAIL | FAIL | FAIL | PASS |
| jee_mains.pdf::extracted::1 | FAIL | FAIL | FAIL | PASS | FAIL | PASS | PASS | PASS |

### Physics.docx

| Question ID | Boundary | Stem | Options | Ordering | Type | Equation | Image | Table |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Physics.docx::source::1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::2 | PASS | PASS | PASS | PASS | PASS | PASS | FAIL | PASS |
| Physics.docx::source::3 | PASS | PASS | PASS | PASS | PASS | PASS | FAIL | PASS |
| Physics.docx::source::4 | PASS | PASS | FAIL | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::5 | PASS | PASS | FAIL | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::6 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::7 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::8 | PASS | PASS | FAIL | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::9 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::10 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::11 | PASS | PASS | FAIL | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::12 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::13 | PASS | PASS | PASS | PASS | PASS | PASS | FAIL | PASS |
| Physics.docx::source::14 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::15 | PASS | PASS | FAIL | PASS | PASS | PASS | PASS | FAIL |
| Physics.docx::source::16 | PASS | FAIL | FAIL | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::17 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::18 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::19 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::20 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::21 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::22 | PASS | PASS | PASS | PASS | PASS | PASS | FAIL | PASS |
| Physics.docx::source::23 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::24 | PASS | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::25 | PASS | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::26 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::27 | PASS | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::28 | PASS | PASS | PASS | PASS | PASS | FAIL | PASS | PASS |
| Physics.docx::source::29 | PASS | PASS | PASS | PASS | FAIL | FAIL | PASS | PASS |
| Physics.docx::source::30 | PASS | PASS | PASS | PASS | PASS | PASS | FAIL | PASS |
| Physics.docx::source::31 | PASS | PASS | PASS | PASS | PASS | FAIL | PASS | PASS |
| Physics.docx::source::32 | PASS | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::33 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::34 | PASS | PASS | PASS | PASS | PASS | FAIL | PASS | PASS |
| Physics.docx::source::35 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics.docx::source::36 | PASS | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::37 | PASS | FAIL | FAIL | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::38 | PASS | PASS | FAIL | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::39 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::40 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::41 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::source::42 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics.docx::extracted::1 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |

### Physics_cleaned_dataset.docx

| Question ID | Boundary | Stem | Options | Ordering | Type | Equation | Image | Table |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Physics_cleaned_dataset.docx::source::1 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::2 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::3 | PASS | FAIL | FAIL | PASS | PASS | FAIL | FAIL | PASS |
| Physics_cleaned_dataset.docx::source::4 | PASS | PASS | FAIL | PASS | FAIL | FAIL | FAIL | PASS |
| Physics_cleaned_dataset.docx::source::5 | PASS | PASS | FAIL | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::6 | PASS | PASS | FAIL | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::7 | PASS | PASS | FAIL | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::8 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::9 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::10 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::11 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::12 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::13 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::14 | PASS | PASS | FAIL | PASS | FAIL | FAIL | FAIL | PASS |
| Physics_cleaned_dataset.docx::source::15 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::16 | PASS | PASS | FAIL | PASS | FAIL | PASS | PASS | FAIL |
| Physics_cleaned_dataset.docx::source::17 | PASS | PASS | FAIL | PASS | PASS | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::18 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::19 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::20 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::21 | PASS | PASS | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::22 | PASS | PASS | FAIL | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::23 | PASS | PASS | FAIL | PASS | PASS | PASS | FAIL | PASS |
| Physics_cleaned_dataset.docx::source::24 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::25 | PASS | PASS | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::26 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::27 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::28 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::29 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::30 | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::31 | FAIL | FAIL | FAIL | PASS | FAIL | PASS | FAIL | PASS |
| Physics_cleaned_dataset.docx::source::32 | FAIL | FAIL | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::33 | FAIL | FAIL | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::34 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::35 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::36 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::37 | FAIL | FAIL | PASS | PASS | FAIL | PASS | PASS | PASS |
| Physics_cleaned_dataset.docx::source::38 | FAIL | FAIL | FAIL | PASS | FAIL | FAIL | PASS | PASS |
| Physics_cleaned_dataset.docx::source::39 | PASS | PASS | FAIL | PASS | FAIL | FAIL | FAIL | PASS |

