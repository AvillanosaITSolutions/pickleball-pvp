#!/bin/bash
# Initial production setup

set -e

echo "🔧 Setting up production environment..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker found"

# Create directories
echo "📁 Creating directories..."
mkdir -p logs backups

# Copy example env files
echo "📋 Copying environment template files..."
if [ ! -f "api/.env.production" ]; then
    cp api/.env.production api/.env.production
    echo "⚠️  Created api/.env.production - please fill in your values:"
    echo "   - AUTH0_DOMAIN"
    echo "   - AUTH0_AUDIENCE"
    echo "   - AUTH0_ISSUER"
    echo "   - PAYMONGO_SECRET_KEY"
    echo "   - PAYMONGO_PUBLIC_KEY"
    echo "   - PAYMONGO_WEBHOOK_SECRET"
    echo "   - DATABASE_URL"
    echo "   - JWT_SECRET"
fi

# Generate secure JWT secret if not exists
if ! grep -q "JWT_SECRET=" api/.env.production || grep "JWT_SECRET=your-"; then
    echo "🔑 Generating secure JWT secret..."
    JWT_SECRET=$(openssl rand -base64 32)
    if [ -f "api/.env.production" ]; then
        sed -i.bak "s/JWT_SECRET=.*/JWT_SECRET=$JWT_SECRET/" api/.env.production
    fi
fi

# Create network
echo "🌐 Creating Docker network..."
docker network create app 2>/dev/null || true

# Test build
echo "🔨 Testing Docker build..."
docker compose -f docker-compose.prod.yml build --no-cache

echo ""
echo "✨ Setup complete!"
echo ""
echo "📝 TODO:"
echo "1. Edit api/.env.production with your production secrets"
echo "2. Configure Auth0 (see DEPLOYMENT.md section 1.1)"
echo "3. Configure PayMongo (see DEPLOYMENT.md section 1.2)"
echo "4. Setup SSL certificate (see DEPLOYMENT.md section 4)"
echo "5. Run: docker compose -f docker-compose.prod.yml up -d"
