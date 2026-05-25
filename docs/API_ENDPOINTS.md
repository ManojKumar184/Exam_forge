# ExamForge API Endpoints

Base URL: `http://localhost:5000/api` (dev)

## Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | No |

## Auth

| Method | Path | Auth |
|--------|------|------|
| POST | `/auth/register` | No (roles: student, faculty only) |
| POST | `/auth/login` | No |
| POST | `/auth/refresh` | No |
| POST | `/auth/logout` | Yes |
| GET | `/auth/me` | Yes |
| PATCH | `/auth/me` | Yes |
| POST | `/auth/forgot-password` | No |
| POST | `/auth/reset-password` | No |

## Catalog

| Method | Path | Auth |
|--------|------|------|
| GET | `/subjects` | Yes |
| GET | `/chapters` | Yes |
| GET | `/exam-types` | Yes |

## Questions (Phase 2)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/questions` | Yes | Pagination, filters, search |
| GET | `/questions/:id` | Yes | Faculty/student: approved only |
| POST | `/questions` | Faculty, Admin | |
| POST | `/questions/reconstruct` | Faculty, Admin | Editor assist only — `{ html?, plain?, ocrText?, images?, useGemini? }` → reconstructed fields (not persisted) |
| PATCH | `/questions/:id` | Admin | |
| DELETE | `/questions/:id` | Admin | |
| POST | `/questions/:id/approve` | Admin | |
| POST | `/questions/:id/reject` | Admin | body: `{ notes }` |
| POST | `/questions/bulk/approve` | Admin | `{ ids: string[] }` |
| POST | `/questions/bulk/reject` | Admin | `{ ids, notes? }` |
| POST | `/questions/bulk/delete` | Admin | `{ ids }` |

### Query params (GET `/questions`)

`page`, `limit`, `search`, `status`, `subject_id`, `chapter_id`, `exam_type_id`, `class`, `difficulty`, `question_type`, `source`, `upload_id`, `sort_by`, `sort_order`

## Uploads (Phase 2)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/uploads` | Admin | multipart `file` |
| GET | `/uploads` | Admin | |
| GET | `/uploads/:id` | Admin | |

## Papers (Phase 3)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/papers` | Yes | Role filtered |
| GET | `/papers/:id` | Yes | |
| POST | `/papers` | Faculty, Admin | |
| PATCH | `/papers/:id` | Faculty, Admin | owner/admin |
| DELETE | `/papers/:id` | Faculty, Admin | owner/admin |
| POST | `/papers/generate` | Faculty, Admin | auto selection + distribution |

## Tests, Attempts, Leaderboard (Phase 3)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/tests` | Yes | list/filter |
| GET | `/tests/:id` | Yes | |
| POST | `/tests` | Faculty, Admin | create from paper |
| PATCH | `/tests/:id` | Faculty, Admin | |
| POST | `/tests/:id/start` | Student | start/resume attempt |
| POST | `/tests/:id/autosave` | Student | autosave answers |
| POST | `/tests/:id/submit` | Student | final submit/scoring |
| POST | `/tests/:id/auto-submit` | Student | timer-driven submit |
| GET | `/tests/attempts/me` | Student | own attempt history |
| GET | `/tests/:id/attempts` | Student, Faculty, Admin | scoped attempt list |
| GET | `/tests/:id/leaderboard` | Yes | ranked scores |
| GET | `/leaderboard/tests/:testId` | Yes | leaderboard mirror endpoint |

## Analytics (Phase 3)

| Method | Path | Auth |
|--------|------|------|
| GET | `/analytics/admin` | Admin |
| GET | `/analytics/faculty` | Faculty, Admin |
| GET | `/analytics/student` | Student |

## Not implemented yet

- OCR (`Phase 4`) — image uploads return error
- AI classification (`Phase 4`) — metadata classification remains modular stub
