# CareFlow — Smart Hospital Management System

CareFlow is a full-stack educational MVP for coordinating hospital operations. It includes a React and TypeScript web app, a FastAPI REST API, and PostgreSQL persistence. The local development profile starts with synthetic demo records so the workflows are visible immediately.

> **For education and demonstrations only.** Do not enter real patient information. This project is not a certified EHR, medical device, diagnostic system, or production-ready healthcare service. Clinical decisions remain with qualified clinicians.

## What is included

- Patient registration, search, and medical record numbers
- Provider directory and appointment scheduling/check-in/completion
- Encounter notes with clinician-entered assessment, plan, and vitals
- Laboratory order queue and result workflow
- Medication inventory, low-stock tracking, prescriptions, and dispensing
- Itemized invoices and payment status
- Department activity and operational dashboard
- JWT authentication, password hashing, role checks, and audit events
- A clinician-reviewed chart-context draft assembled from recorded data; it does not generate diagnoses or treatment recommendations
- API and frontend automated tests, Docker Compose, container builds, and deployment/security documentation

## Start the full stack with Docker

1. Install Docker Desktop or another Docker Compose compatible runtime.
2. Copy `.env.example` to `.env`. Replace the development secrets before sharing or deploying the app.
3. From this folder, run:

   ```sh
   docker compose up --build
   ```

4. Open <http://localhost:5173>. The API docs are at <http://localhost:8000/docs>.

Demo sign-in:

- Email: `admin@hospital.demo`
- Password: `ChangeMe123!`

The demo credentials and seeded records are for local use only. Set `SEED_DEMO_DATA=false`, change the admin password, and set a long random `SECRET_KEY` before any shared deployment.

## Run without Docker

The API defaults to a local SQLite file for a quick preview.

**Terminal 1 — API**

```sh
cd backend
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

**Terminal 2 — web app**

```sh
cd frontend
npm install
npm run dev
```

To use PostgreSQL outside Compose, set `DATABASE_URL` to a SQLAlchemy URL such as `postgresql+psycopg://user:password@localhost:5432/careflow` before starting the API.

## Run automated checks

```sh
cd backend
pip install -r requirements-dev.txt
pytest -q
```

```sh
cd frontend
npm install
npm test
npm run lint
npm run build
```

## Documentation

- [Architecture and API](docs/architecture.md)
- [Security and responsible AI](docs/security-and-ai.md)
- [Deployment guide](docs/deployment.md)

## Product status

This is a runnable MVP with a synthetic seed dataset. It does not include FHIR/HL7 integrations, identity federation, clinical-grade decision support, pharmacy formulary validation, real payment processing, backups, or a cloud account deployment. Review the security and deployment notes before expanding the scope.
