# Telegram Video File Bot

Production-ready Telegram bot that accepts TikTok links and direct HTTPS video links, then returns the video as a Telegram document (file), preserving original quality (no video compression).

## Features

- `/start` command with short usage message.
- `/help` command with the full command list.
- `/settings` command with an inline menu:
  - Toggle video mirroring on/off.
  - Choose one of two built-in background overlays.
  - **Upload custom photo background** (saved per-user, custom overlays only apply to that user).
- `/options` alias for `/settings`.
- Accepts URL in plain text messages.
- Supports TikTok page links using `yt-dlp` extraction.
- HTTPS-only URL validation.
- SSRF protection:
  - Blocks localhost.
  - Blocks private/internal IPv4 and IPv6 ranges.
  - Validates redirect targets.
- Streaming download to disk (no full file buffering in memory).
- Early file size check via `content-length` and hard streaming byte limit.
- Sends result with `sendDocument` (document/file mode, no compression path).
- Temp file cleanup after send.
- Queue with concurrency limit:
  - BullMQ + Redis when `REDIS_URL` is set.
  - In-memory queue fallback when `REDIS_URL` is empty.
- Retry on network errors only.
- Structured logging with pino.

## Tech Stack

- Node.js 20+
- TypeScript
- Telegraf
- Axios
- fs/promises + streams
- dotenv
- pino
- BullMQ (optional)
- yt-dlp (required for TikTok links)

## Project Structure

```text
src/
  bot/
  handlers/
  services/
  utils/
  config/
  jobs/
```

## Configuration

Copy `.env.example` to `.env` and set values:

```env
BOT_TOKEN=
MAX_FILE_SIZE_MB=50
TEMP_DIR=./tmp
MAX_CONCURRENT=5
DOWNLOAD_TIMEOUT_MS=60000
MAX_REDIRECTS=5
NETWORK_RETRY_COUNT=1
REDIS_URL=
YT_DLP_PATH=yt-dlp
TIKTOK_COOKIES_FROM_BROWSER=
```

Notes:

- `BOT_TOKEN` is required.
- If `REDIS_URL` is empty, the bot uses in-process queueing.
- For TikTok links, `yt-dlp` must be installed and accessible by `YT_DLP_PATH`.
- Optional: set `TIKTOK_COOKIES_FROM_BROWSER` (for example `safari`, `chrome`, `firefox`) to let `yt-dlp` use your logged-in browser cookies; this can expose higher-quality TikTok formats for some videos.
- Telegram bot document limit is usually around 50MB; keep `MAX_FILE_SIZE_MB` aligned with your bot limits.

## Run Locally

```bash
npm install
npm run build
npm start
```

For development mode:

```bash
npm run dev
```

## Docker

Build and run:

```bash
docker build -t telegram-video-file-bot .
docker run --rm -e BOT_TOKEN=your_token_here telegram-video-file-bot
```

## Bot Behavior

1. User runs `/start`.
2. Bot replies:
  `Send me a direct video link. I will return the processed video. Use /help to view all commands. Optional: use /settings to change mirror and overlay.`
3. Optional: user runs `/help` to view command list.
4. Optional: user runs `/settings` (or `/options`) and customizes:
   - Mirroring (on/off)
   - Built-in overlays (Background 1, Background 2)
   - Upload custom photo background (saved only for that user)
5. User sends URL.
6. Bot replies `Processing...`.
7. Bot validates URL and source safety.
8. Bot downloads via stream (direct links) or `yt-dlp` (TikTok links) to temp file.
9. Bot processes video with selected settings:
   - Default behavior is unchanged: mirror on + default overlay
   - Custom settings only apply to that individual user
   - Custom photo backgrounds are stored per-user in temp directory
10. Bot sends video back.
11. Bot deletes temp file (including custom overlays after use).

## Deployment

For production deployment on servers, see [DEPLOYMENT.md](DEPLOYMENT.md) for comprehensive setup instructions including:
- Prerequisites (Node.js 20+, ffmpeg, yt-dlp)
- Environment configuration
- Process management options (PM2, Docker, systemd)
- Troubleshooting and performance tuning

### Deploy Backend On Render (Free)

1. Push this project to GitHub.
2. In Render, click New + and select Blueprint.
3. Connect your GitHub repo and deploy using [render.yaml](render.yaml).
4. In Render dashboard, set required secrets:
  - BOT_TOKEN
  - BACKEND_API_KEY
5. Keep `YT_DLP_PATH` as `./bin/yt-dlp` (set by blueprint) so TikTok downloads work.
6. Wait for deployment and copy service URL, for example https://your-service.onrender.com.
7. Verify health endpoint: https://your-service.onrender.com/health.
8. In Worker project folder tgbot, set secrets:

```bash
npx wrangler secret put BACKEND_URL
npx wrangler secret put BACKEND_API_KEY
npx wrangler deploy
```

Use the same BACKEND_API_KEY value in Render and Worker.
- `Source is not supported`
- `Request timed out`
- `File is too large for Telegram`
- `Network error. Please try again.`
- `Unable to process this link`

## Security Notes

- Only `https://` links are accepted.
- Hostnames are DNS-resolved and checked against private/internal networks.
- Redirect targets are revalidated.
- TikTok mode uses `yt-dlp` subprocess with fixed arguments (no user-provided command execution).
- Filenames are sanitized.

## Acceptance Notes

This implementation meets the target workflow:

- Validate link and reject unsafe targets.
- Stream download without memory buffering whole file.
- Send back as document/file mode.
- Preserve original media file bytes (no transcoding).
- Cleanup temp files after send.
- Enforce size/time/concurrency constraints.

## Quality Reality

- The bot sends the best source format that TikTok exposes to `yt-dlp`, as a Telegram document (no Telegram compression path).
- If TikTok only provides low-bitrate variants for a specific video, the resulting file can still be small.
- To maximize available formats, use `TIKTOK_COOKIES_FROM_BROWSER` and restart the bot.
