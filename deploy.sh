#!/bin/bash

set -e

echo "🚀 Deploying to bulgare@nicefox.net..."
echo ""

ssh -t bulgare@nicefox.net bash -l << 'ENDSSH'
# Load nvm if available
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

cd app
echo "📂 Changed to app directory"
echo ""

echo "📥 Pulling latest changes..."
git pull
echo ""

echo "📦 Installing dependencies..."
npm install
echo ""

echo "🔨 Building project..."
npm run build
echo ""

echo "♻️  Restarting PM2 process..."
pm2 restart ecosystem.config.cjs
echo ""

echo "📋 Showing PM2 logs (Ctrl+C to exit)..."
pm2 logs 0
ENDSSH

echo ""
echo "✅ Deployment complete!"
