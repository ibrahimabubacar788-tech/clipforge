# ClipForge

ClipForge is a full-stack video clipping workspace. It provides a browser editor backed by an authenticated JSON database, local object storage, and a durable render queue. The render worker records an export artifact locally; production deployments can replace `ClipQueue` with an FFmpeg/S3 worker without changing the API contract.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4173`. The browser provisions a local creator account on first use, then persists its bearer-token session in local storage. The API is served from the same origin.

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`
- `GET /api/me`, `GET|POST /api/projects`, `PATCH /api/projects/:id`
- `POST /api/uploads`, `POST /api/videos`
- `GET|POST /api/clips`, `DELETE /api/clips/:id`, `GET /api/jobs/:id`

All non-auth endpoints require `Authorization: Bearer <token>`. Uploads accept a JSON base64 payload and are stored under `storage/uploads`; rendered export manifests are exposed under `storage/exports` after the queue completes.

## Checks

```bash
npm run check
npm test
```

## Deployment

Build and run the container with `docker compose up --build`. The Compose file mounts named volumes for the database and generated/uploaded media. CI runs syntax checks, the API integration suite, and a Docker build on pushes and pull requests.
