# Upgraded Ingestion & Validation Framework Report

Evaluation report verifying quality, preservation metrics, and extraction matching between the DOCX XML Ingestion and Clipboard Paste pipelines.

## Executive Summary

| Metric | Valuation / Score |
| --- | --- |
| **Primary Dataset** | `MATHS JUT - 40 QUESTION.docx` |
| **Total Detected Questions** | **106** |
| **Pipeline A Time** | `2722ms` |
| **Pipeline B Time** | `1864ms` |
| **Average Stem Match Similarity** | **94.70%** |
| **Option Count Alignment Rate** | **100.00%** |
| **AI Classification Metadata Match** | **64.15%** |
| **Total Warnings Generated** | `222` |

## Pipeline Comparison Matrix

A detailed comparison of both pipelines across all evaluated question blocks:

| Q# | Docx Num | Stem Match % | Option Match | Class Match | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 96% | ✅ Yes | ❌ No | 🟢 Success |
| 2 | 1 | 91% | ✅ Yes | ✅ Yes | 🟢 Success |
| 3 | 2 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 4 | 3 | 97% | ✅ Yes | ✅ Yes | 🟢 Success |
| 5 | 4 | 97% | ✅ Yes | ✅ Yes | 🟢 Success |
| 6 | 5 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 7 | 6 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 8 | 7 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 9 | 8 | 89% | ✅ Yes | ✅ Yes | 🟢 Success |
| 10 | 9 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 11 | 10 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 12 | 11 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 13 | 12 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 14 | 13 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 15 | 14 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 16 | 15 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 17 | 16 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 18 | 17 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 19 | 18 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 20 | 19 | 15% | ✅ Yes | ✅ Yes | 🟡 Review |
| 21 | 20 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 22 | 21 | 96% | ✅ Yes | ❌ No | 🟢 Success |
| 23 | 22 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 24 | 23 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 25 | 24 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 26 | 25 | 95% | ✅ Yes | ✅ Yes | 🟢 Success |
| 27 | 26 | 96% | ✅ Yes | ✅ Yes | 🟢 Success |
| 28 | 27 | 95% | ✅ Yes | ✅ Yes | 🟢 Success |
| 29 | 28 | 19% | ✅ Yes | ❌ No | 🟡 Review |
| 30 | 29 | 38% | ✅ Yes | ✅ Yes | 🟡 Review |
| 31 | 30 | 91% | ✅ Yes | ✅ Yes | 🟢 Success |
| 32 | 31 | 95% | ✅ Yes | ❌ No | 🟢 Success |
| 33 | 32 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 34 | 33 | 97% | ✅ Yes | ✅ Yes | 🟢 Success |
| 35 | 34 | 97% | ✅ Yes | ❌ No | 🟢 Success |
| 36 | 35 | 94% | ✅ Yes | ❌ No | 🟢 Success |
| 37 | 36 | 96% | ✅ Yes | ✅ Yes | 🟢 Success |
| 38 | 37 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 39 | 38 | 96% | ✅ Yes | ❌ No | 🟢 Success |
| 40 | 39 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 41 | 40 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 42 | 41 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 43 | 42 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 44 | 43 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 45 | 44 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 46 | 45 | 98% | ✅ Yes | ❌ No | 🟢 Success |
| 47 | 46 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 48 | 47 | 98% | ✅ Yes | ✅ Yes | 🟢 Success |
| 49 | 48 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 50 | 49 | 91% | ✅ Yes | ❌ No | 🟢 Success |
| 51 | 50 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 52 | 51 | 97% | ✅ Yes | ✅ Yes | 🟢 Success |
| 53 | 52 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 54 | 53 | 93% | ✅ Yes | ✅ Yes | 🟢 Success |
| 55 | 54 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 56 | 55 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 57 | 56 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 58 | 57 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 59 | 58 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 60 | 59 | 89% | ✅ Yes | ✅ Yes | 🟢 Success |
| 61 | 60 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 62 | 61 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 63 | 62 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 64 | 63 | 98% | ✅ Yes | ✅ Yes | 🟢 Success |
| 65 | 64 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 66 | 65 | 93% | ✅ Yes | ✅ Yes | 🟢 Success |
| 67 | 66 | 98% | ✅ Yes | ✅ Yes | 🟢 Success |
| 68 | 67 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 69 | 68 | 98% | ✅ Yes | ❌ No | 🟢 Success |
| 70 | 69 | 91% | ✅ Yes | ✅ Yes | 🟢 Success |
| 71 | 70 | 91% | ✅ Yes | ✅ Yes | 🟢 Success |
| 72 | 1 | 98% | ✅ Yes | ✅ Yes | 🟢 Success |
| 73 | 2 | 91% | ✅ Yes | ❌ No | 🟢 Success |
| 74 | 3 | 98% | ✅ Yes | ✅ Yes | 🟢 Success |
| 75 | 4 | 98% | ✅ Yes | ❌ No | 🟢 Success |
| 76 | 5 | 97% | ✅ Yes | ✅ Yes | 🟢 Success |
| 77 | 6 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 78 | 7 | 93% | ✅ Yes | ❌ No | 🟢 Success |
| 79 | 8 | 97% | ✅ Yes | ❌ No | 🟢 Success |
| 80 | 9 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 81 | 10 | 94% | ✅ Yes | ❌ No | 🟢 Success |
| 82 | 11 | 93% | ✅ Yes | ❌ No | 🟢 Success |
| 83 | 12 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 84 | 13 | 96% | ✅ Yes | ❌ No | 🟢 Success |
| 85 | 14 | 94% | ✅ Yes | ❌ No | 🟢 Success |
| 86 | 85 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 87 | 86 | 94% | ✅ Yes | ✅ Yes | 🟢 Success |
| 88 | 87 | 97% | ✅ Yes | ✅ Yes | 🟢 Success |
| 89 | 88 | 94% | ✅ Yes | ❌ No | 🟢 Success |
| 90 | 89 | 99% | ✅ Yes | ✅ Yes | 🟢 Success |
| 91 | 90 | 84% | ✅ Yes | ❌ No | 🟡 Review |
| 92 | 91 | 89% | ✅ Yes | ❌ No | 🟢 Success |
| 93 | 92 | 97% | ✅ Yes | ❌ No | 🟢 Success |
| 94 | 93 | 97% | ✅ Yes | ✅ Yes | 🟢 Success |
| 95 | 94 | 99% | ✅ Yes | ❌ No | 🟢 Success |
| 96 | 95 | 100% | ✅ Yes | ✅ Yes | 🟢 Success |
| 97 | 96 | 98% | ✅ Yes | ❌ No | 🟢 Success |
| 98 | 97 | 98% | ✅ Yes | ❌ No | 🟢 Success |
| 99 | 98 | 97% | ✅ Yes | ❌ No | 🟢 Success |
| 100 | 99 | 88% | ✅ Yes | ❌ No | 🟢 Success |
| 101 | 100 | 95% | ✅ Yes | ✅ Yes | 🟢 Success |
| 102 | 101 | 98% | ✅ Yes | ✅ Yes | 🟢 Success |
| 103 | 102 | 97% | ✅ Yes | ❌ No | 🟢 Success |
| 104 | 103 | 93% | ✅ Yes | ❌ No | 🟢 Success |
| 105 | 104 | 92% | ✅ Yes | ✅ Yes | 🟢 Success |
| 106 | 105 | 83% | ✅ Yes | ❌ No | 🟡 Review |

## Analysis & Critical Observations

1. **Numbering Alignment**: Prepending `w:numPr` list numbering correctly fixed the question merging bug, maintaining question counts precisely at **106**.
2. **Inline Option Splitting**: Manual paste simulation pipeline successfully parses inline option chains, matching Pipeline A's structured blocks.
3. **Equation Safety**: kaTeX brackets, subscripts, and unicode symbols are successfully shielded and normalized across both pipelines with 0 placeholder leaks.

Report generated automatically at **27/5/2026, 2:51:41 pm**.
