# Deployment notes

This portfolio now supports both static serving and dynamic API serving.

## Local dynamic run

```bash
npm install
npm start
# open http://127.0.0.1:8080
```

## APIs

- `GET /api/health`
- `GET /api/reviews`
- `POST /api/reviews`
- `POST /api/contact`
- `POST /api/analytics`

Data is persisted to `data/runtime/*.json` in the running container/host. For production-grade persistence, mount a volume or replace JSON files with DynamoDB, RDS, Supabase, Turso, or another managed store.

## Docker

```bash
docker build -t nathaniel-portfolio .
docker run --rm -p 8080:8080 nathaniel-portfolio
```

## ECS Express/Fargate notes

Use container port `8080`. Attach an ALB or public service endpoint and configure persistent storage if reviews/contact data must survive container replacement.

Required task settings:

- CPU/memory: small Fargate profile is enough for this site
- Container port: `8080`
- Health check path: `/api/health`
- Optional environment: `PORT=8080`

GitHub Actions contains:

- `.github/workflows/docker-smoke.yml` for image smoke tests
- `.github/workflows/deploy-ecs.yml` for ECR/ECS deployment scaffolding
