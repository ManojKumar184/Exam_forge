# ExamForge AI — Supabase → MERN Migration Plan

## Architecture (target)

```
React (Vite) ──axios──► Express REST API ──► MongoDB (Mongoose)
                              │
                              ├── uploads/ (Multer, local/S3 later)
                              ├── extraction/ (pdf-parse, mammoth)
                              ├── ocr/ (Tesseract → cloud later)
                              └── ai/ (OpenAI / Gemini / Ollama)
```

Supabase is **deprecated** for auth and database. Optional: Supabase Storage for files until Phase 2 upload service is complete.

---

## Phase status

| Phase | Scope | Status |
|-------|--------|--------|
| **1** | Backend scaffold, MongoDB models, JWT auth, frontend AuthContext + catalog API | **Done** |
| **2** | Question CRUD, real upload pipeline, admin review | **Done** |
| **3** | Paper builder, intelligent selection, KaTeX rendering, test lifecycle, users API | **Largely done (3B)** |
| **4** | OCR, AI classification, KaTeX rendering | Not started |
| **5** | PDF export, WebSocket autosave, production hardening | Partial (analytics API done) |

---

## Phase 1 — Completed in this increment

### Backend (`backend/`)

- Express server with helmet, cors, rate limit, error handling
- Mongoose models: User, Subject, Topic, ExamType, Question, Paper, OnlineTest, TestAttempt, Upload, Leaderboard
- JWT access + refresh tokens, bcrypt passwords
- Auth routes: register, login, logout, refresh, me, forgot/reset password
- Catalog routes: subjects, topics/chapters, exam-types
- Seed script for admin + exam types + subjects
- Stub modules: `ai/`, `ocr/`, `extraction/`, `generators/` (throw until implemented — **no fake data**)

### Frontend (preserved UI)

- `src/api/` — axios client with token refresh
- `src/context/AuthContext.tsx` — replaces Supabase auth
- `useAuth()` hook unchanged for pages
- `ApiConfigError` replaces Supabase env gate
- Catalog fetches via API in `dataStore`
- Registration restricted to `student` | `faculty` only
- Dashboard `CardHeader`/`CardBody` import fix

### Migrated in Phase 2

- Question CRUD + approval via `/api/questions`
- Real upload + extraction via `/api/uploads`
- `UploadQuestionsPage`, `QuestionBankPage`, `dataStore` question methods

### Migrated in Phase 3 (MERN)

- Papers CRUD + `PaperGeneratorPage` (manual builder, dnd-kit reorder)
- Online tests: start / autosave / submit / auto-submit, `TestTakingPage`, review route
- Leaderboard + analytics REST + frontend pages (`/leaderboard`, `/analytics`)
- `supabase/migrations/` retained as historical reference only (no runtime dependency)

### Remaining (Phase 4+)

- Admin user listing API (`fetchUsers` stub)
- OCR / AI pipelines, PDF generator, WebSocket autosave
- PDF scanned-image OCR (Phase 4)
- Server-side PDF paper export

---

## Environment

### Frontend `.env`

```env
VITE_API_URL=http://localhost:5000
```

### Backend `backend/.env`

Copy `backend/.env.example`. Required: `MONGODB_URI`, JWT secrets.

```bash
cd backend
npm install
cp .env.example .env
npm run seed   # creates admin + reference data
npm run dev
```

### Frontend

```bash
npm install
npm run dev
```

---

## API map (Supabase → REST)

| Frontend usage | New endpoint | Phase |
|----------------|--------------|-------|
| `supabase.auth.*` | `/api/auth/*` | 1 ✅ |
| `from('subjects')` | `GET /api/subjects` | 1 ✅ |
| `from('chapters')` | `GET /api/chapters` | 1 ✅ |
| `from('exam_types')` | `GET /api/exam-types` | 1 ✅ |
| `from('questions')` | `/api/questions` | 2 |
| `from('uploads')` + storage | `/api/uploads` + Multer | 2 |
| `from('papers')` | `/api/papers` | 3 |
| `from('online_tests')` | `/api/tests` | 3 |
| `from('test_attempts')` | `/api/tests/:id/attempts` | 3 |
| Analytics counts | `/api/analytics` | 5 |
| Leaderboard | `/api/leaderboard` | 3 |

---

## Schema alignment notes

MongoDB models use camelCase internally; API responses map to frontend snake_case (`full_name`, `subject_id`, etc.) for compatibility with existing React types.

`Topic` model = frontend `Chapter`.

`Paper.questions[]` embeds paper-question links (replaces `paper_questions` table).

---

## Security checklist

- [x] Public registration cannot create `super_admin`
- [x] Passwords hashed with bcrypt
- [x] Refresh token rotation stored on user document
- [ ] Rate limit auth endpoints (Phase 5)
- [ ] Email delivery for password reset (Phase 5)
- [ ] Remove `@supabase/supabase-js` dependency (Phase 2 complete)

---

## Next implementation steps (Phase 2)

1. `questionRoutes` + `questionController` — CRUD, approve/reject
2. `uploadRoutes` + Multer + `extractionService` (real pdf-parse/mammoth)
3. Refactor `UploadQuestionsPage` to poll upload job status
4. Refactor `QuestionBankPage` / `dataStore` question methods to API
5. Remove mock question generation from upload flow
