# Table Ingestion Category Validation Suite Report

This report evaluates and records the table extraction fidelity across five distinct table categories.

## Overall Performance

* **Average Table Extraction Fidelity**: **100.00%**
* **Timestamp**: 8/6/2026, 6:51:17 am

| Category | Fixture File | Ingestion Fidelity | Notes |
| --- | --- | --- | --- |
| **Plain Text Table** | `plain_text_table.docx` | **100%** | ✅ Perfect Extraction |
| **Equation Table** | `equation_table.docx` | **100%** | ✅ Perfect Extraction |
| **Image Table** | `image_table.docx` | **100%** | ✅ Perfect Extraction |
| **Match-the-following Table** | `match_following_table.docx` | **100%** | ✅ Perfect Extraction |
| **Merged Cell Table** | `merged_cells_table.docx` | **100%** | ✅ Perfect Extraction |

## Category Details and Verification Status

1. **Plain Text Table**: Validates structure mapping, cell text values, and dimension limits.
2. **Equation Table**: Validates nested OMML translation to LaTeX within cells, shielding math elements.
3. **Image Table**: Validates media extraction and inline cell reference substitution.
4. **Match-the-following Table**: Validates multi-column alignment mapping and lists reconstruction.
5. **Merged Cell Table**: Validates HTML-equivalent `colspan` and `rowspan` detection and translation.
