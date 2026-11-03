# Deployment guide

## Local containers

Docker Compose starts PostgreSQL, the API, and the Vite development server. It is intended for a local development demonstration, not production. PostgreSQL data persists in the `postgres_data` volume. `docker compose down -v` deletes that local database volume.

## Production-shaped images

- `backend/Dockerfile` builds a non-root Python API image.
- `frontend/Dockerfile` has a multi-stage production target that builds the web assets and serves them with Nginx.
- The web image needs `VITE_API_URL` at build time; point it to the public HTTPS API origin.
- The API needs a private PostgreSQL URL, a strong random `SECRET_KEY`, explicit CORS origins, and operator-managed admin credentials.

Example frontend production build:

```sh
docker build --target production --build-arg VITE_API_URL=https://api.example.org -t careflow-web:1.0 ./frontend
```

## Cloud deployment outline

For AWS, use a managed container service for the API and web container, a private managed PostgreSQL database, private networking between them, a public HTTPS load balancer for the browser-facing service, and a secrets manager for database credentials and signing keys. Keep the database off the public internet. Configure health checks, logs, backups, restore drills, and alerting before opening access. Use separate development, staging, and production environments.

This repository does not create AWS resources, DNS, TLS certificates, IAM policies, or a live cloud deployment. Those require account-specific decisions and review. Do not deploy the sample credentials, seed data, or local Compose configuration as-is.

## Temporary public demo on Render

The repository includes `render.yaml` for a temporary demo deployment with a public static frontend, public API, and private-network PostgreSQL connection. The API and database use Render's free plans; the seeded patient records are synthetic. The administrator password must be supplied during Blueprint setup and is not stored in this repository. Do not enter real patient data.

To deploy, place the project in a private GitHub repository, create a new Render Blueprint from that repository, review the three free resources, and supply a strong administrator password when prompted. Render provides a public `onrender.com` URL for the frontend. The free web services can spin down while idle, and free PostgreSQL expires after 30 days, so this is suitable only for a short demonstration. Use a paid database plan and complete security review before retaining data or using this beyond a demo.

## Schema changes

The demo creates tables on startup for convenience. Production deployments should add Alembic migrations, run migrations as a controlled release step, and test rollback and backup restoration before upgrading the live database.
