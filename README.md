# ClipForge

ClipForge is a full-stack video clipping workspace. It provides a browser editor backed by an authenticated JSON database, local object storage, and a durable FFmpeg render queue. The worker trims uploaded MP4 source videos, crops them to the selected format, optionally burns in the selected caption treatment, and stores a playable MP4 export locally.

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

All non-auth endpoints require `Authorization: Bearer <token>`. Uploads accept a JSON base64 payload and are stored under `storage/uploads`. Pass the returned upload `url` as `sourceUrl` when creating a video; completed exports are playable MP4 files exposed under `storage/exports`.

## Checks

```bash
npm run check
npm test
```

## Deployment

Build and run the container with `docker compose up --build`. The Compose file mounts named volumes for the database and generated/uploaded media. CI runs syntax checks, the API integration suite, and a Docker build on pushes and pull requests.
