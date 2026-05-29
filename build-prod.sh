# Production build script
# Run: npm run build:prod

set -e

echo "🔨 Building frontend for production..."
npm run build

echo "🔨 Building API for production..."
cd api
npm run build
cd ..

echo "🐳 Building Docker images..."
docker compose -f docker-compose.prod.yml build

echo "✅ Production build complete!"
echo ""
echo "Next: Copy api/.env.production with production secrets, then run:"
echo "  docker compose -f docker-compose.prod.yml up -d"
