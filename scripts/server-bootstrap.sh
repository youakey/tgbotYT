#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$PWD}"

if [[ ! -f "$APP_DIR/package.json" ]]; then
  echo "Error: run this script in the project directory (package.json not found)."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "Installing ffmpeg..."
  sudo apt-get update
  sudo apt-get install -y ffmpeg
fi

if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "Installing yt-dlp..."
  sudo apt-get update
  sudo apt-get install -y python3-pip
  pip3 install -U yt-dlp
fi

if [[ ! -f "$APP_DIR/.env" ]]; then
  echo "Creating .env from template..."
  cat > "$APP_DIR/.env" << 'EOF'
BOT_TOKEN=
ENABLE_POLLING=true
PORT=3000
BACKEND_API_KEY=
MAX_FILE_SIZE_MB=50
TEMP_DIR=./tmp
MAX_CONCURRENT=2
DOWNLOAD_TIMEOUT_MS=60000
MAX_REDIRECTS=5
NETWORK_RETRY_COUNT=1
REDIS_URL=
YT_DLP_PATH=yt-dlp
TIKTOK_COOKIES_FROM_BROWSER=
FFMPEG_PATH=ffmpeg
OVERLAY_PATH=assets/shorts-overlay.png
PROCESS_TIMEOUT_MS=60000
EOF
  echo "Fill BOT_TOKEN in .env and run again."
  exit 1
fi

if ! grep -Eq '^BOT_TOKEN=.+$' "$APP_DIR/.env"; then
  echo "Error: BOT_TOKEN is empty in .env"
  exit 1
fi

cd "$APP_DIR"
npm install
npm run build

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Installing PM2..."
  sudo npm i -g pm2
fi

pm2 delete tgbot >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | tail -n 1

echo "Deployment complete. Check logs with: pm2 logs tgbot"
