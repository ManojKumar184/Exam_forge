# ExamForge production deployment and readiness

## Current classification

**NOT READY for production SaaS or institutional student data.** This repository now has tenant model/context foundations and tenant scoping on important question, bank, paper, exam, upload, attempt, analytics, and file paths. The isolation suite currently verifies context resolution with mocked model lookups, not two live institutions and their complete API flows. Do not onboard real institutions until the blockers at the end of this document are closed.

## Local verification

From the repository root:

```sh
npm ci --prefix backend
npm test --prefix backend
find backend/src -name '*.js' -print0 | xargs -0 -n1 node --check
npm ci --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

## Deployment shape

```text
Browser → HTTPS CDN/static frontend → HTTPS API → authenticated TLS MongoDB
                                          ├→ private object storage (required before scale-out)
                                          └→ durable document worker (required before scale-out)
```

The current document worker is process-local/background-job based and uploads use local disk. For initial single-node evaluation, keep the API and worker on one persistent host and mount the upload directory on durable encrypted storage. This is not suitable as the system of record for multiple API instances. Implement and configure an object-storage provider plus a durable queue before horizontal scaling.

## Environment configuration

Set `NODE_ENV=production`, `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CLIENT_URL`, `CORS_ORIGINS`, `UPLOAD_DIR`, and `MAX_UPLOAD_MB`. Production startup requires 32-character JWT secrets, HTTPS origins, and an authenticated TLS MongoDB URI. Use unique random secrets from a secret manager; rotate credentials if they have ever been committed or shared. Do not use development fallback secrets.

The database URI should point to a production MongoDB deployment with authentication, TLS, backups, and least-privilege credentials. The API configures a bounded connection pool and timeouts. Do not expose MongoDB publicly.

## Migration behavior

At startup, the additive `migrateInstitutions()` backfill creates a legacy institution for each existing non-super-admin account and creates a membership/default institution. It associates that user's existing questions, banks, papers, uploads, exams, and attempts without deleting them. It deliberately does **not** trust the old free-form `schoolInstitute` string as proof that different accounts belong to the same tenant. Old shared school accounts therefore require institution-admin invitation/reassociation before sharing data. Take a verified database backup and test this backfill on a restored copy before production deployment. The migration is idempotent but is currently run synchronously at application startup; a separately controlled migration command is preferable for large production datasets.

## Canonical question content

Questions now have an additive `canonicalContent` field using `examforge-question-content/v1`. It stores ordered stem and option blocks, explanation blocks, answer data, provenance, and validation details. Existing `contentBlocks` and scalar fields remain compatibility projections for current bank, paper, export, and exam consumers. API responses derive canonical content for legacy records that do not yet have it; no backfill migration has run or is required to read those records.

The existing editor can edit text/equation blocks, table cell text, and image references; embedded source objects remain preserved for review. Canonical content in options/explanations is currently persisted and rendered through the existing legacy option/explanation projections, so richer option/explanation editing is still incomplete. Do not assume every downstream export consumes the full canonical IR until its integration tests cover these blocks.

The local `@xenova/transformers` dependency is not currently used to load a normalization model, and no checked-in model weights were found. Ingestion continues to use deterministic extraction/classification and human review; there is no supported local generative normalization model yet. The current benchmark report is historical and is not a validated before/after ground-truth result.

## Backup and recovery responsibilities

These are infrastructure responsibilities, not implemented application guarantees:

1. Configure encrypted MongoDB point-in-time recovery or daily snapshots; retain at least 30 daily and 12 monthly recovery points, subject to institutional policy.
2. Back up private uploaded files and extracted assets with versioning and lifecycle retention. Keep file backups aligned with database snapshots.
3. Run a quarterly restore drill into an isolated environment. Verify login, tenant memberships, representative question/paper/exam records, and associated files.
4. Document RPO/RTO, key recovery, DNS/TLS recovery, and incident contacts before onboarding institutions.

## Launch checklist

- [ ] Production domain, TLS, CDN, and HTTPS-only frontend configured.
- [ ] API hosted behind TLS with `NODE_ENV=production`, exact CORS origins, and secure cookies.
- [ ] MongoDB authentication/TLS, least privilege, indexes, backup retention, and restore drill verified.
- [ ] Private object storage, retention, malware scanning, and restore process implemented.
- [ ] Durable worker/queue deployed with retry, dead-letter handling, and job idempotency.
- [ ] SMTP/email provider configured for invitations, verification, and password reset; currently not implemented.
- [ ] Production secrets stored in a secret manager and rotated; no default credentials.
- [ ] Monitoring, alerting, request correlation, error tracking, and log retention configured.
- [ ] CI passed, dependency audit findings triaged, production build deployed, `/api/health` and `/api/ready` monitored.
- [ ] Tenant migration dry-run approved; data ownership exceptions manually reconciled.
- [ ] Super-admin account secured with MFA/strong credential controls; currently MFA is not implemented.
- [ ] Institution creation, faculty invitations, student enrollment, role changes, and suspension tested.
- [ ] Trial/plan policy, data retention after cancellation, billing provider, tax/invoicing, and support procedures decided.

## Remaining blockers

| Problem | Why it matters | Required action |
|---|---|---|
| No full live database multi-tenant end-to-end test | Mocked middleware tests cannot establish A/B isolation through real API/database queries, filters, exports, files, and attempts. | Add isolated integration database fixtures for two institutions, all key roles/resources, and run the required A/B inverse access matrix. |
| Faculty/student invitation and membership administration is incomplete | New students cannot join a tenant through the product; member removal, suspension, role changes, and verified invitations are missing. | Implement invite tokens/email, acceptance, membership CRUD, and authorization tests. |
| Some older controllers and analytics/admin paths have not received a complete service-by-service tenant audit | A single overlooked query can expose another institution's data. | Audit every route and data access, including catalog/document-classification/leaderboard/export/analytics/member APIs, and add negative IDOR tests. |
| Local disk and process-local document jobs remain | Multi-instance deployment can lose files/jobs or make them unavailable on another node. | Implement a provider-neutral storage interface with production object storage and a durable job queue/worker. |
| Submission idempotency is not transactionally guaranteed | Concurrent retries can still race and produce duplicate or inconsistent attempts/scores. | Use a unique attempt identity/idempotency key and atomic conditional transition or transaction, then concurrency-test it. |
| Refresh tokens are hashed now, but access JWT revocation is bounded only by its 15-minute lifetime; no MFA | A stolen live access cookie remains usable until expiration, and admin takeover controls are limited. | Add MFA for admins, incident/session revocation, and abuse monitoring. |
| Audit events cover only some major actions | Membership changes, authentication failures, exports, and other sensitive actions need accountable records. | Complete audit event coverage and retention/access controls without logging credentials or student answer content. |
| Plan/usage model is a foundation, not a complete billing/entitlement system | Several limits and features are not metered/enforced; no payment provider, invoices, tax, or dunning exists. | Define launch plans and policy; complete all limits and integrate a provider only after business configuration. |
| Dependency audit and production infrastructure have not been verified in this environment | Build success does not prove dependency safety, backup recovery, monitoring, or production configuration. | Run CI audits with network access, triage advisories, configure infrastructure, and complete restore/incident drills. |
