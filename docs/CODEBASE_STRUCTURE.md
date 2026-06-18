# ExamForge — Codebase Structure & File Functions

> Generated: 2026-06-13
> Total files: ~120+ across frontend (React/TypeScript), backend (Node.js/Express), and infrastructure (Supabase).

---

## Project Root

| File | Purpose |
|------|---------|
| `index.html` | Vite entry HTML for the React SPA |
| `vite.config.ts` | Vite build/dev server configuration (port 5173, proxy to backend :5000) |
| `tsconfig.json` | Root TypeScript config (references `tsconfig.app.json` + `tsconfig.node.json`) |
| `tsconfig.app.json` | TypeScript config for the React app source code |
| `tsconfig.node.json` | TypeScript config for Vite/Node tooling |
| `eslint.config.js` | ESLint flat config for code quality |
| `tailwind.config.js` | Tailwind CSS theme customization (colors, fonts, prose plugin) |
| `postcss.config.js` | PostCSS config (Tailwind + autoprefixer) |
| `package.json` | Root package.json (scripts: dev, build, preview) |

---

## Frontend (`src/`)

### Entry & App Shell

| File | Purpose |
|------|---------|
| `main.tsx` | React entry point — mounts `<App />`, wraps with providers |
| `App.tsx` | Root App component — React Router routes, auth guards, layout |
| `index.css` | Global styles + Tailwind directives |
| `config/api.ts` | Axios client config (base URL `:5000/api`, interceptors for JWT) |
| `config/mathRenderer.ts` | Math renderer engine selection (KaTeX vs MathJax) |
| `context/AuthContext.tsx` | React Context for auth state (user, session, login/logout) |
| `hooks/useAuth.ts` | Hook wrapping AuthContext for convenience |
| `types/index.ts` | TypeScript types: Question, User, Test, Paper, SyllabusNode, etc. |

### API Layer (`src/api/`)

| File | Purpose |
|------|---------|
| `client.ts` | Axios HTTP client with auth interceptor (refreshes tokens) |
| `auth.ts` | Auth API: login, register, logout, refresh token |
| `questions.ts` | Questions API: CRUD, list, approve, delete, bulk operations |
| `questionBanks.ts` | Question Bank API: create, assign, remove questions |
| `questionReconstruct.ts` | Question reconstruction API (paste/import from clipboard) |
| `papers.ts` | Papers API: create, generate, export PDF/DOCX |
| `syllabus.ts` | Syllabus API: tree CRUD, chapters, topics |
| `tests.ts` | Tests API: create, attempt, grade, review |
| `uploads.ts` | Upload API: upload DOCX files, check upload status |
| `users.ts` | Users API: CRUD, role management |
| `analytics.ts` | Analytics API: stats, charts, reports |
| `catalog.ts` | Catalog API: subjects, chapters, exam types |

### State Management (`src/stores/`)

| File | Purpose |
|------|---------|
| `authStore.ts` | Zustand store: auth state, user profile |
| `dataStore.ts` | Zustand store: subjects, chapters, questions, banks (main data) |
| `questionStore.ts` | Zustand store: question editing state |
| `paperStore.ts` | Zustand store: paper generation state |
| `testStore.ts` | Zustand store: test-taking state |
| `userStore.ts` | Zustand store: user management |
| `catalogStore.ts` | Zustand store: syllabus catalog state |

### UI Components (`src/components/`)

#### Shared UI (`src/components/ui/`)

| File | Purpose |
|------|---------|
| `Alert.tsx` | Inline alert/notification box (variants: success, warning, error, info) |
| `Badge.tsx` | Badge/label component (size, variant variants) |
| `Button.tsx` | Button component (variant, size, loading state, icon support) |
| `Card.tsx` | Card container with optional header/footer |
| `DataTable.tsx` | Generic data table with sorting, filtering, pagination |
| `EmptyState.tsx` | Empty state placeholder (icon + message + action) |
| `Input.tsx` | Form input with label, error, left icon support |
| `Loading.tsx` | Loading spinner/skeleton |
| `Modal.tsx` | Overlay modal dialog (size variants) |
| `MultiSelect.tsx` | Multi-select dropdown with chips |
| `PageHeader.tsx` | Page title + subtitle + actions bar |
| `Select.tsx` | Native select dropdown with label |
| `StatCard.tsx` | Dashboard stat card (value, label, trend) |
| `Tabs.tsx` | Tab navigation component |
| `Textarea.tsx` | Textarea with label |
| `index.ts` | Barrel export for all UI components |

#### Content Rendering

| File | Purpose |
|------|---------|
| `content/RichContent.tsx` | **Core rendering component** — renders question text with math (KaTeX/MathJax), tables, images. Handles both HTML and plain text paths. Key exports: `RichContent`, `QuestionContentPreview`, `RichOptionContent` |

#### Math Rendering

| File | Purpose |
|------|---------|
| `math/MathProvider.tsx` | Math renderer context provider (selects KaTeX vs MathJax) |
| `math/MathRenderer.tsx` | Renders a single LaTeX expression (inline or display) |

#### Question Components

| File | Purpose |
|------|---------|
| `questions/QuestionList.tsx` | Reusable question list with selection, filters, batch actions |
| `questions/QuestionPreviewModal.tsx` | Modal showing full question details |
| `questions/QuestionEditorForm.tsx` | Question create/edit form |
| `questions/RichQuestionEditor.tsx` | Rich text editor for question content with math toolbar |
| `questions/OptionRichFields.tsx` | Rich option editor (multi-field for each answer choice) |
| `questions/LatexToolbar.tsx` | LaTeX toolbar for math insertion in editor |
| `questions/ReconstructionPreview.tsx` | Preview panel for reconstructed questions |
| `questions/StagingEditModal.tsx` | Edit modal for staged/reconstructed questions |

#### Paper Components

| File | Purpose |
|------|---------|
| `paper/SortableSectionQuestions.tsx` | Drag-and-drop sortable question list for paper sections |

#### Layout

| File | Purpose |
|------|---------|
| `layout/Layout.tsx` | App shell — sidebar navigation, header, main content area |

### Pages (`src/pages/`)

#### Dashboard

| File | Purpose |
|------|---------|
| `LandingPage.tsx` | Public landing page (hero, features, login CTA) |
| `dashboard/index.tsx` | Dashboard router (admin vs faculty vs student) |
| `dashboard/AdminDashboard.tsx` | Admin dashboard — stats, charts, recent activity |
| `dashboard/FacultyDashboard.tsx` | Faculty dashboard — question stats, recent uploads |
| `dashboard/StudentDashboard.tsx` | Student dashboard — upcoming tests, results |

#### Auth

| File | Purpose |
|------|---------|
| `auth/index.ts` | Auth page router (login/register switch) |
| `auth/LoginPage.tsx` | Login form |
| `auth/RegisterPage.tsx` | Registration form |

#### Questions

| File | Purpose |
|------|---------|
| `questions/index.ts` | Questions page router |
| `questions/QuestionBankPage.tsx` | **Main Question Bank** — list/filter/search questions, approve/reject, view details, bulk actions, assignment to banks |
| `questions/QuestionEditorPage.tsx` | Create/edit individual question |
| `questions/ImportCenterPage.tsx` | DOCX file upload, extraction status, staged questions review |
| `questions/WorkspacePage.tsx` | Clipboard paste / question reconstruction workspace |
| `questions/TemplateBuilderPage.tsx` | Question template builder |
| `questions/SyllabusManagerPage.tsx` | Syllabus tree management (exam patterns, classes, subjects) |
| `questions/QuestionBanksManagerPage.tsx` | Question bank CRUD |
| `questions/ModerationQueuePage.tsx` | Question moderation queue (approve/reject workflow) |

#### Paper

| File | Purpose |
|------|---------|
| `paper/index.ts` | Paper page router |
| `paper/PaperGeneratorPage.tsx` | Paper generation from selected questions |
| `paper/PaperExportWorkspace.tsx` | Export paper (PDF/DOCX) with preview |
| `paper/PapersListPage.tsx` | List of all generated papers |
| `paper/paperBuilderUtils.ts` | Paper builder utility functions |

#### Test

| File | Purpose |
|------|---------|
| `test/index.ts` | Test page router |
| `test/TestsListPage.tsx` | List of all tests |
| `test/TestTakingPage.tsx` | Test-taking interface (student view) |
| `test/TestGradingPage.tsx` | Manual grading interface |
| `test/TestReviewPage.tsx` | Test results review |

#### Other

| File | Purpose |
|------|---------|
| `analytics/AnalyticsPage.tsx` | Full analytics dashboard with charts |
| `leaderboard/LeaderboardPage.tsx` | Student leaderboard |
| `users/UsersPage.tsx` | User management (admin only) |
| `settings/SettingsPage.tsx` | User/profile settings |
| `settings/InstitutionProfilePage.tsx` | Institution profile settings |

### Utilities (`src/utils/`)

| File | Purpose |
|------|---------|
| `clipboardIngestion.ts` | Clipboard paste detection + processing (plain text, HTML, OMML) |
| `downloadBlob.ts` | Blob download helper (PDF, DOCX) |
| `equationAutoWrap.ts` | Auto-wraps inline equations detected in text |
| `mathConverter.ts` | **OMML/MathML → LaTeX converter** — full XML parser, AST, LaTeX generation |
| `mathNormalizer.ts` | Normalizes LaTeX expression formatting |
| `mediaUrl.ts` | Resolves media/image URLs from backend |
| `mcqReconstruct.ts` | MCQ option reconstruction from pasted text |
| `questionPasteDetect.ts` | Detects question boundaries in pasted text |
| `questionReconstruct.ts` | Question reconstruction from raw paste |
| `reconstructionPipeline.ts` | Client-side reconstruction pipeline |
| `testSessionStorage.ts` | Test session persistence (localStorage) |
| `textBlocksParser.ts` | Parses text blocks into structured sections |
| `wordHtmlCleanup.ts` | **Client-side Word HTML cleanup** — strips Office noise, extracts images, decodes entities |

### Other

| File | Purpose |
|------|---------|
| `lib/designTokens.ts` | Design system tokens (colors, spacing, shadows) |
| `lib/latexParts.ts` | LaTeX content splitting (text vs math segments) |
| `ApiConfigError.tsx` | API configuration error boundary component |

---

## Backend (`backend/`)

### Entry & Config

| File | Purpose |
|------|---------|
| `src/server.js` | Express server entry — middleware, routes, socket.io, error handler |
| `src/config/env.js` | Environment config loader — reads .env, validates required vars, exports `env` object |
| `package.json` | Backend dependencies (Express, Mongoose, mammoth, dotenv, etc.) |

### Routes (`backend/src/routes/`)

| File | Purpose |
|------|---------|
| `authRoutes.js` | Auth routes: login, register, refresh, logout |
| `userRoutes.js` | User CRUD routes |
| `questionRoutes.js` | Question CRUD routes (list, filter, approve, delete, bulk ops) |
| `questionBankRoutes.js` | Question bank routes (create, assign, remove) |
| `syllabusRoutes.js` | Syllabus tree routes (CRUD) |
| `paperRoutes.js` | Paper routes (generate, export PDF/DOCX) |
| `testRoutes.js` | Test routes (create, attempt, grade, review) |
| `uploadRoutes.js` | Upload routes (upload DOCX, check status, get staged questions) |
| `leaderboardRoutes.js` | Leaderboard routes |
| `institutionProfileRoutes.js` | Institution profile routes |

### Services (`backend/src/services/`)

| File | Purpose |
|------|---------|
| `authService.js` | Auth business logic (JWT, password hashing, sessions) |
| `userService.js` | User CRUD business logic |
| `questionService.js` | Question CRUD + approval + bulk operations |
| `uploadService.js` | **DOCX upload processing** — chunking, extractDocxQuestions, AI classification, staging to DB |
| `paperService.js` | Paper generation logic |
| `paperSelectionService.js` | Question selection algorithm for papers |
| `paperExportService.js` | Paper export (PDF via Puppeteer, DOCX via docx-templates) |
| `paperDocxService.js` | DOCX generation for papers |
| `testService.js` | Test CRUD + attempt logic |
| `gradingService.js` | Auto-grading logic (MCQ, numerical, descriptive) |
| `analyticsService.js` | Analytics computation |
| `leaderboardService.js` | Leaderboard computation |
| `questionReconstructService.js` | Server-side question reconstruction from paste |

### Extraction Pipeline (`backend/src/extraction/`)

| File | Purpose |
|------|---------|
| `extractDocxQuestions.js` | **Main entry** — mammoth DOCX→HTML, image extraction, HTML section parsing, runs reconstruction pipeline per section |
| `reconstructionPipeline.js` | **13-stage reconstruction pipeline** — Word cleaner → HTML normalization → Figure isolation → Math shielding → DOM blocks → Option detection → Statement detection → Table reconstruction → AI refinement → Type classification → Metadata scoring → KaTeX verification → DB object generation |
| `normalizeQuestions.js` | Normalizes extracted blocks → structured question objects, section context propagation, merges with AI metadata |
| `htmlQuestionParser.js` | Parses HTML blocks from mammoth into structured question segments |
| `columnReadingOrder.js` | Columns/table reading order detection |
| `sectionParser.js` | Section boundary detection in DOCX HTML |
| `metadataClassifier.js` | Rule-based metadata classification (class, difficulty, subject hints) |
| `detectQuestionType.js` | Rule-based question type detection |

### AI Module (`backend/src/ai/`)

| File | Purpose |
|------|---------|
| `providerRegistry.js` | Provider registry — `getRulesProvider()`, `getLlmProvider()` |
| `providers/baseProvider.js` | Abstract base class for AI providers |
| `providers/huggingFaceProvider.js` | **HF provider** — classify(), classifyBatch(), refineQuestion() via HF Inference API. Auto-detects router endpoints |
| `providers/ollamaProvider.js` | Ollama fallback provider (local) |
| `classificationPipeline.js` | **Full classification pipeline** — rules → semantic matching → LLM augmentation → field confidence → status determination |
| `semanticTagging.js` | Semantic subject/chapter matching using keyword scores |
| `syllabusCatalog.js` | Syllabus catalog management + hint resolution |

### Validators (`backend/src/validators/`)

| File | Purpose |
|------|---------|
| `authValidators.js` | Auth request validation (login, register shapes) |
| `questionValidators.js` | Question schema validation (incl. `semanticQuestionSchema`) |
| `paperValidators.js` | Paper request validation |
| `testValidators.js` | Test request validation |
| `gradingValidators.js` | Grading request validation |

### Utilities (`backend/src/utils/`)

| File | Purpose |
|------|---------|
| `logger.js` | Structured JSON logger (`pino`-style) |
| `AppError.js` | Custom error class with status codes |
| `asyncHandler.js` | Express async error wrapper |
| `questionTypeNormalizer.js` | **Canonical type mapper** — normalizes all types (MCQ_SINGLE, MCQ_MULTIPLE, NUMERICAL_INTEGER, etc.) |
| `questionMapper.js` | Question DB←→API object mapper |
| `userMapper.js` | User DB←→API object mapper |
| `examMapper.js` | Exam DB←→API object mapper |
| `resourceMapper.js` | Generic resource mapper |
| `exportUtils.js` | Export utility helpers |
| `equationFingerprint.js` | Equation fingerprinting (duplicate detection) |
| `duplicateHash.js` | Duplicate question detection via hash |
| `textSimilarity.js` | Text similarity comparison (Levenshtein, Jaccard) |
| `tokens.js` | Token counting utilities |
| `seed.js` | Database seeding (admin user, subjects, exam types) |
| `retry.js` | Async retry utility with backoff |

### Socket

| File | Purpose |
|------|---------|
| `socket/index.js` | Socket.io setup for real-time upload progress / test events |

---

## Database Migrations (`supabase/`)

| File | Purpose |
|------|---------|
| `migrations/20260524104321_001_initial_schema.sql` | Initial Supabase schema (users, questions, papers, tests, syllabus) |
| `migrations/20260524104401_002_rls_policies.sql` | Row-level security policies |

---

## Documentation (`docs/`)

| File | Purpose |
|------|---------|
| `API_ENDPOINTS.md` | Complete API endpoint documentation |
| `MERN_MIGRATION.md` | Notes on MERN stack migration history |
| `CODEBASE_STRUCTURE.md` | **This file** — comprehensive structure & function reference |

---

## Key Data Flow: DOCX Upload → Question Bank

```
Physics_cleaned_dataset.docx
         │
         ▼
  mammoth (DOCX → HTML)
         │
         ▼
  extractDocxQuestions.js
    ├─ Images extracted (base64 → disk)
    ├─ HTML section parser
    └─ Per-section call:
         │
         ▼
  reconstructionPipeline.js (13 stages)
    ├─ Stage 1-3: Clean HTML, protect figures
    ├─ Stage 4-6: Math shielding → block extraction → option detection
    ├─ Stage 7-9: Statements → Tables → AI refinement (skipped for upload)
    ├─ Stage 10-12: Classification → Metadata → KaTeX check
    └─ Stage 13: DB-ready object
         │
         ▼
  normalizeQuestions.js
    ├─ Section context propagation
    └─ Merges AI classification metadata
         │
         ▼
  uploadService.js → staging collection
         │
         ▼
  batch classification (HF: 0.5B model, ~4s)
         │
         ▼
  Question Bank (UI) → Review → Approve → Paper → Test
```

---

## Key Data Flow: Question Preview Rendering

```
API Response (question.question_text)
         │
         ▼
  decodeHtmlEntities() — HTML entities → characters
         │
         ▼
  hasHtmlMarkup? ────yes────> dangerouslySetInnerHTML + <br/> for \n
         │
         no
         ▼
  renderTextWithTablesAndMath()
    ├─ Split by [TABLE_N] markers
    └─ renderTextWithMath() → whitespace-pre-wrap spans
         │
         ▼
  MathContentWrapper (KaTeX/MathJax auto-render)
         │
         ▼
  Rendered preview with math, tables, images
```

---

## HF Model Speed Benchmarks

| Model | Params | Est. Response Time | Use |
|-------|--------|-------------------|-----|
| Qwen/Qwen2.5-0.5B-Instruct | **0.5B** | **0.5–1.5s** | 🏆 **Primary** — fastest classification |
| Qwen/Qwen3-1.7B-Instruct | 1.7B | 1–3s | Fallback 1 — better accuracy |
| Qwen/Qwen2.5-7B-Instruct | 7B | 5–12s | Fallback 2 — hard cases |
| google/gemma-3-12b-it | 12B | 10–20s | Fallback 3 |
| meta-llama/Llama-3.1-8B-Instruct | 8B | 6–15s | Fallback 4 |

**Rate limits (HF Serverless Inference API, free tier):** ~1000 requests / 5 min. With 0.5B model at ~1s/req, you can classify ~60 questions/minute comfortably.
