# Deployment Guide

This guide covers deploying the Telegram video bot to a server.

## Prerequisites

- Node.js 20+ installed on the server
- `yt-dlp` installed and accessible (for TikTok links)
- `ffmpeg` installed and accessible (for video processing)
- Optional: Redis for distributed queue (if not using in-memory queue)

## Server Setup Steps

### 1. Clone and Install Dependencies

```bash
git clone <your-repo-url> /path/to/tgbot
cd /path/to/tgbot
npm install --production
```

### 2. Create Environment File

Create a `.env` file in the project root with required variables:

```env
BOT_TOKEN=your_telegram_bot_token_here
ENABLE_POLLING=true
PORT=3000
BACKEND_API_KEY=
MAX_FILE_SIZE_MB=50
TEMP_DIR=./tmp
MAX_CONCURRENT=5
DOWNLOAD_TIMEOUT_MS=60000
MAX_REDIRECTS=5
NETWORK_RETRY_COUNT=1
PROCESS_TIMEOUT_MS=60000
YT_DLP_PATH=/usr/local/bin/yt-dlp
FFMPEG_PATH=/usr/local/bin/ffmpeg
OVERLAY_PATH=./assets/shorts-overlay.png
# Optional: for distributed processing with Redis
# REDIS_URL=redis://localhost:6379
# Optional: for TikTok cookies
# TIKTOK_COOKIES_FROM_BROWSER=chrome
```

**Environment Variable Notes:**
- `BOT_TOKEN`: Get from BotFather on Telegram (@BotFather)
- `ENABLE_POLLING`: Set `true` for classic bot polling; set `false` when Cloudflare Worker handles updates and this server acts only as backend queue processor
- `PORT`: HTTP port for backend API (`POST /api/queue/add`, `GET /health`)
- `BACKEND_API_KEY`: Optional shared secret for backend API auth
- `MAX_CONCURRENT`: Adjust based on server resources (default 5)
- `PROCESS_TIMEOUT_MS`: Increase if processing videos takes longer (default 60000ms / 60s)
- `DOWNLOAD_TIMEOUT_MS`: Increase for slow networks (default 60000ms / 60s)
- `REDIS_URL`: If empty, uses in-memory queue (simpler, single-instance only)

### 3. Build for Production

```bash
npm run build
```

This creates a `dist/` folder with compiled JavaScript.

### 4. Ensure Temp Directory

The app automatically creates `./tmp/` directory during startup. Make sure the user running the bot has write permissions:

```bash
mkdir -p ./tmp
chmod 700 ./tmp
```

### 5. Verify Asset Overlays

Ensure overlay files exist in the `assets/` directory:

```bash
ls -l assets/
# Should show:
# shorts-overlay.png   (default overlay)
# shorts-overlay1.png  (alternative overlay)
```

If missing, either add them or update `OVERLAY_PATH` in `.env`.

## Running the Bot

When using Cloudflare Worker webhook mode, run this server as backend-only:

```bash
# .env
ENABLE_POLLING=false
PORT=3000
```

The server exposes:
- `POST /api/queue/add` - queue a video job from Worker
- `GET /health` - health check endpoint

### Option A: Direct Node

```bash
node dist/app.js
```

### Option B: PM2 (Process Manager)

Install PM2:

```bash
npm install -g pm2
```

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [
    {
      name: "telegram-video-bot",
      script: "./dist/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
```

Start with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Option C: Docker

Build the image:

```bash
docker build -t telegram-video-bot .
```

Run container:

```bash
docker run -d \
  --name telegram-video-bot \
  -e BOT_TOKEN=your_token \
  -e TEMP_DIR=/app/tmp \
  -v /path/to/assets:/app/assets \
  -v /path/to/tmp:/app/tmp \
  telegram-video-bot
```

## Monitoring

### Check Logs

For PM2:

```bash
pm2 logs telegram-video-bot
```

For Docker:

```bash
docker logs telegram-video-bot -f
```

### Check Bot Status

Send `/start` to your bot in Telegram to verify it's working.

## Key Features

- **Mirror Video**: Toggle video mirroring on/off per user
- **Choose Overlay**: Select from built-in overlays (Background 1, Background 2)
- **Custom Overlay**: Users can upload their own photo as background (saved per-user)
- **Settings Menu**: Access via `/settings` or `/options`
- **Help Command**: `/help` shows all available commands

## User Guide for Bot

When users interact with the bot:

1. `/start` - Quick start message with usage info
2. `/help` - View all available commands
3. `/settings` or `/options` - Open settings menu to:
   - Toggle video mirroring
   - Choose overlay background
   - Upload custom photo background
4. Send a video link - Bot processes with user's selected settings

## Troubleshooting

### Error: "ffmpeg is not installed"

Install ffmpeg:

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# CentOS/RHEL
sudo yum install ffmpeg
```

### Error: "yt-dlp is not installed"

Install yt-dlp:

```bash
# macOS
brew install yt-dlp

# Ubuntu/Debian
sudo apt-get install yt-dlp

# Or via pip
pip install yt-dlp
```

### Error: "Overlay file is missing"

Verify overlay files exist in `assets/` directory:

```bash
ls -la assets/*.png
```

If missing, add them or update `assets/` path in `.env` to point to where overlays are stored.

### Bot Not Responding

Check that:
1. Bot token is correct in `.env`
2. Bot process is running: `ps aux | grep "node dist/app.js"`
3. Network connectivity is available
4. Firewall doesn't block outbound HTTPS traffic

### High Memory Usage

- Reduce `MAX_CONCURRENT` in `.env` to limit parallel processing
- Set `max_memory_restart` in PM2 config to auto-restart on memory threshold

## Updates

To update the bot after code changes:

```bash
pull latest code
npm install --production
npm run build
pm2 restart telegram-video-bot
# or
# systemctl restart telegram-video-bot (if using systemd)
```

## Security Notes

- Keep `BOT_TOKEN` secret (use `.env` file, never commit to version control)
- Use `.gitignore` to exclude `.env` files
- Run bot as non-root user when possible
- Monitor temporary file cleanup in `./tmp/` directory
- Consider using environment secrets manager for production

## Performance Tuning

### For High Load

1. Increase `MAX_CONCURRENT` in `.env` (with adequate server resources)
2. Consider increasing process memory limits
3. Use Redis for distributed queue:
   ```env
   REDIS_URL=redis://localhost:6379
   ```
4. Run multiple bot instances with load balancing

### For Low-Bandwidth Servers

1. Reduce `MAX_CONCURRENT` to 1-2
2. Increase timeouts: `DOWNLOAD_TIMEOUT_MS=120000`
3. Use ffmpeg with slower preset: modify `videoProcessingService.ts` `-preset fast` to `-preset slower`

## Support

For issues or questions:
1. Check logs with PM2 or Docker
2. Verify `.env` configuration
3. Ensure all dependencies (ffmpeg, yt-dlp) are installed
4. Check firewall and network settings
