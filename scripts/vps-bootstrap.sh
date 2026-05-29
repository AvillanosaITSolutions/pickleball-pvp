#!/usr/bin/env bash
# One-time setup for a fresh Ubuntu/Debian VPS.
# This is used on the same VPS that runs sip-n-bite-nutrition and other projects.
# It connects to the existing Traefik instance and shared Postgres.
# Run as root or with sudo: bash vps-bootstrap-rageroom.sh

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0"
  exit 1
fi

echo "================================================"
echo "Rageroom VPS Bootstrap"
echo "================================================"

# Check if Docker is already installed
if command -v docker &> /dev/null; then
    echo "✅ Docker already installed"
else
    echo "📦 Installing Docker..."
    apt-get update -y
    apt-get install -y ca-certificates curl gnupg ufw
    
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc 2>/dev/null \
      || curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    DISTRO_ID=$(. /etc/os-release && echo "$ID")
    CODENAME=$(. /etc/os-release && echo "${VERSION_CODENAME:-stable}")

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/${DISTRO_ID} ${CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list

    apt-get update -y
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    echo "✅ Docker installed"
fi

# Ensure deploy user exists
if ! id -u deploy >/dev/null 2>&1; then
    echo "👤 Creating deploy user..."
    useradd -m -s /bin/bash deploy
    usermod -aG docker deploy
    mkdir -p /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    echo "✅ Deploy user created"
else
    echo "✅ Deploy user already exists"
fi

# Create rageroom directory
mkdir -p /home/deploy/rageroom
chown -R deploy:deploy /home/deploy/rageroom

# Ensure firewall is configured
if ! ufw status | grep -q "Status: active"; then
    echo "🔥 Configuring firewall..."
    ufw allow OpenSSH
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
    echo "✅ Firewall configured"
else
    echo "✅ Firewall already configured"
fi

echo ""
echo "================================================"
echo "✅ Bootstrap complete"
echo "================================================"
echo ""
echo "📝 Next steps (as the 'deploy' user or via GitHub Actions):"
echo ""
echo "  1. If deploying manually:"
echo "     cd ~/rageroom"
echo "     cp .env.example .env"
echo "     # fill in the environment variables"
echo "     docker compose -f docker-compose.prod.yml pull"
echo "     docker compose -f docker-compose.prod.yml up -d"
echo ""
echo "  2. If using GitHub Actions:"
echo "     Add the deploy key to /home/deploy/.ssh/authorized_keys"
echo "     Set GitHub secrets (see DEPLOY.md)"
echo "     Push to main branch to trigger deployment"
echo ""
echo "📝 Important:"
echo "   - Traefik and shared Postgres must be running on this VPS"
echo "   - The visa-reminder_default network must already exist"
echo "   - Check: docker network ls | grep visa-reminder_default"
echo ""
echo "================================================"
