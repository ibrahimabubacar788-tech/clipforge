# ClipForge

ClipForge is a full-stack video clipping workspace. It provides a browser editor backed by an authenticated database, private local media storage, and a durable FFmpeg render queue. The worker trims uploaded source videos, crops them to the selected format, optionally burns in caption treatments, and stores playable MP4 exports.

## Run locally

```bash
npm install
npm start
```

Open `http://localhost:4173`. The browser provisions a local creator account on first use, then persists its bearer-token session in local storage. The API is served from the same origin.

## Features

- Authenticated creator workspaces and projects
- Video upload with resumable-safe retry IDs and a 250 MB server-side limit
- Browser source-video preview with range selection
- Manual clip rendering through an FFmpeg queue
- Automatic transcription with OpenAI speech-to-text when `OPENAI_API_KEY` is configured
- Automatic highlight selection with AI ranking and a heuristic fallback
- Burned-in caption styling and ClipForge watermarking
- Render progress, retry, preview, rename, delete, favorites, search, filtering, sorting, and bulk clip actions
- Private source media; uploaded files are not served directly from `/storage`
- PostgreSQL-backed application state when `DATABASE_URL` is configured, with a local JSON fallback

## API

Authentication:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`

Projects and videos:
- `GET|POST /api/projects`
- `PATCH /api/projects/:id`
- `DELETE /api/projects/:id`
- `GET /api/videos?projectId=:id`
- `POST /api/uploads`
- `POST /api/videos`
- `GET /api/videos/:id/stream`
- `POST /api/videos/:id/transcript`
- `POST /api/videos/:id/transcribe`
- `POST /api/videos/:id/auto-clip`
- `GET /api/videos/:id/auto-clip-status`

Clips and jobs:
- `GET|POST /api/clips`
- `PATCH /api/clips/:id`
- `DELETE /api/clips/:id`
- `POST /api/clips/:id/retry`
- `GET /api/clips/:id/download`
- `GET /api/jobs/:id`

All non-authenticated API routes require `Authorization: Bearer <token>`.

### Uploading a source video

`POST /api/uploads` accepts the raw binary video body, not a JSON/base64 payload. Send:

- `Content-Type: video/*`
- `X-Filename: <original filename>`
- optional `X-Upload-Id: <stable retry id>`
- `Authorization: Bearer <token>`

The response contains a private `/storage/uploads/...` URL. Pass that URL as `sourceUrl` when creating the video record.

## Configuration

- `DATABASE_URL`: PostgreSQL connection string. If omitted, ClipForge uses the local JSON database.
- `DATABASE_SSL=false`: disables PostgreSQL TLS verification only when explicitly set.
- `OPENAI_API_KEY`: enables automatic transcription and optional OpenAI highlight ranking.
- `CLIPFORGE_HIGHLIGHT_ENGINE`: defaults to `local`, using ClipForge's built-in highlight-selection logic without a paid ranking request. Set to `openai` to opt into external ranking; if that request fails, ClipForge falls back to local ranking.
- `OPENAI_HIGHLIGHT_MODEL`: optional model override when `CLIPFORGE_HIGHLIGHT_ENGINE=openai`.
- `FFMPEG_PATH`: optional FFmpeg executable override.

## Checks

```bash
npm run check
npm test
```

## Deployment

The repository includes `render.yaml` and a Docker setup.

ClipForge stores uploaded source videos and generated exports on the service filesystem. On Render, a free web service has an ephemeral filesystem, so local media can disappear when the service restarts, spins down, or redeploys. Render documents persistent disks as a paid-service feature; use persistent storage or an external object-storage design before relying on Render for long-term media retention.

The application state can use Render Postgres through `DATABASE_URL`, but free Render Postgres instances also have a limited lifetime. Treat the current free configuration as a development/testing deployment rather than durable production media storage.
