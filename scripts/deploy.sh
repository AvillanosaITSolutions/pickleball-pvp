#!/bin/bash
# Deploy to production

set -e

echo "🚀 Starting deployment..."

# Check if .env.production exists
if [ ! -f "api/.env.production" ]; then
    echo "❌ api/.env.production not found!"
    echo "Please copy api/.env.production.example to api/.env.production and fill in the values."
    exit 1
fi

# Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# Build images
echo "🔨 Building Docker images..."
docker compose -f docker-compose.prod.yml build

# Start services
echo "🚀 Starting services..."
docker compose -f docker-compose.prod.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Run migrations
echo "🗄️  Running database migrations..."
docker compose -f docker-compose.prod.yml exec -T api npm run migration:run

# Verify deployment
echo "✅ Verifying deployment..."
if curl -s https://api.$(basename $(git config --get remote.origin.url) .git)/api/health > /dev/null 2>&1; then
    echo "✅ API is responding!"
else
    echo "⚠️  API health check failed. Check logs:"
    docker compose -f docker-compose.prod.yml logs api
fi

echo ""
echo "✨ Deployment complete!"
echo ""
echo "Next steps:"
echo "1. Verify frontend loads at your domain"
echo "2. Test Auth0 login"
echo "3. Test PayMongo checkout"
echo ""
echo "View logs: docker compose -f docker-compose.prod.yml logs -f"
