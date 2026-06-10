# Ingestion Architecture Refactor Benchmark Report

Generated on: 8/6/2026, 8:50:25 pm

## 1. Synthetic Fixtures Accuracy

| Category | Before Refactor Success | After Refactor Success | Detected Type (After) | Detected Options (After) |
| --- | --- | --- | --- | --- |
| JEE Main | N/A | ✅ PASS | mcq_single | 4 |
| JEE Advanced | N/A | ❌ FAIL | mcq_single | 4 |
| NEET | N/A | ✅ PASS | mcq_single | 4 |
| CBSE | N/A | ✅ PASS | descriptive | 0 |
| MCQ | ✅ PASS | ✅ PASS | mcq_single | 4 |
| MSQ | ✅ PASS | ✅ PASS | mcq_multi | 4 |
| Numerical | ❌ FAIL | ✅ PASS | numerical | 0 |
| Descriptive | ✅ PASS | ✅ PASS | descriptive | 0 |
| Assertion Reason | ✅ PASS | ✅ PASS | assertion_reason | 4 |
| Match Following | ✅ PASS | ✅ PASS | match_columns | 4 |
| Comprehension | ❌ FAIL | ✅ PASS | comprehension | 4 |
| Tables | ❌ FAIL | ✅ PASS | mcq_single | 4 |
| Images | ❌ FAIL | ✅ PASS | mcq_single | 4 |
| Equations | ❌ FAIL | ✅ PASS | mcq_single | 4 |

## 2. Real Document Regression Comparison

| Metric | Physics.docx (Before) | Physics.docx (After) | Physics Cleaned (Before) | Physics Cleaned (After) |
| --- | --- | --- | --- | --- |
| **Extracted Questions** | 26 | 35 | 32 | 32 |
| **Total Options** | 58 | 94 | 95 | 95 |
| **Questions w/ Tables** | 1 | 1 | 1 | 1 |
| **Questions w/ Equations** | 0 | 0 | 32 | 32 |
| **Questions w/ Images** | 23 | 0 | 7 | 1 |
| **MCQ Question Type** | 14 | 23 | 24 | 24 |
| **MSQ Question Type** | 0 | 0 | 0 | 0 |
| **Numerical Question Type** | 1 | 11 | 0 | 7 |
| **Descriptive Question Type** | 10 | 0 | 7 | 0 |
| **Low Confidence / Review Required** | 1 | 2 | 0 | 0 |
