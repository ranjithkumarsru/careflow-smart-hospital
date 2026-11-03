# Security, privacy, and responsible AI

## Current safeguards

- Passwords are hashed with Argon2 through `pwdlib`; plaintext passwords are not stored.
- Login returns a signed, expiring JWT. Protected routes verify the token and active account.
- Role checks protect clinical, laboratory, pharmacy, billing, and administration routes.
- Administrators provision named staff accounts and assign roles; public self-registration is disabled. Administrators can disable accounts, which invalidates their next API request.
- Staff can change their own CareFlow password. New passwords require at least 12 characters and a letter and number; passwords are never emailed or shown in the account list.
- Repeated failed sign-ins for one email are temporarily throttled in the running app process. Basic browser/API security headers are set.
- Mutating workflows append a minimal audit event. Audit details avoid copying clinical notes.
- The browser uses a session-scoped token rather than persistent local storage.
- Demo patients and notes are synthetic. The app should never be used with real patient data.
- CORS is limited to the configured frontend origin. The default is for local development.

## Important limits before any real deployment

This MVP is not certified, compliance-reviewed, or hardened for protected health information. The login throttling is in-memory and resets when the API restarts; it is not a substitute for a persistent edge rate limiter. Before any real use, complete a threat model and jurisdiction-specific privacy/security review; replace demo credentials and secrets; require HTTPS; configure managed secret storage and encrypted backups; add MFA, verified email invitations and recovery, robust session revocation, persistent rate limits, monitoring, retention rules, disaster recovery, and database migration/rollback procedures; validate authorization and audit coverage; and conduct independent security and clinical safety reviews.

No PHI should be sent to external AI providers from this demo. No generative model is connected. The "visit preparation" feature is a deterministic chart-context assembly that quotes structured records already in the database. It does not infer a condition, rank clinical risk, recommend treatment, or write back to the chart. A clinician must review the source records.

For future AI work, document intended use, input provenance, model/version, limitations, evaluation datasets, bias analysis, human oversight, review/override, audit trail, and rollback. Never present an AI output as a diagnosis or replace clinician judgment.

## Demo credential warning

The seeded administrator password (`ChangeMe123!`) and database password (`careflow_demo_only`) are public development values. Change both before exposing any service beyond a local machine. Set `SEED_DEMO_DATA=false` after creating an operator-managed account.
