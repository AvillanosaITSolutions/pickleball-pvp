# Deployment Quick Start

Get your Rageroom app to production in 5 steps.

## 1️⃣ Configure Third-Party Services (45 min)

### Auth0
1. Go to https://manage.auth0.com
2. Create an **API** with identifier: `https://api.your-domain.com`
3. Create a **SPA Application**, set callback URLs to your domain
4. Copy credentials to `api/.env.production`:
   - `AUTH0_DOMAIN`
   - `AUTH0_AUDIENCE`
   - `AUTH0_ISSUER`

### PayMongo
1. Go to https://dashboard.paymongo.com
2. Create a webhook: `https://api.your-domain.com/api/payments/webhook`
3. Get **live API keys** (not test keys!)
4. Copy to `api/.env.production`:
   - `PAYMONGO_SECRET_KEY`
   - `PAYMONGO_PUBLIC_KEY`
   - `PAYMONGO_WEBHOOK_SECRET`

## 2️⃣ Set Up Server (20 min)

```bash
# SSH into your Linux server
ssh user@your-server.com

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Clone repository
cd /opt
git clone https://github.com/YOUR-ORG/rageroom.git
cd rageroom
```

## 3️⃣ Configure Environment (15 min)

```bash
# Copy environment template
cp api/.env.production api/.env.production.local

# Edit with your secrets (use nano, vim, or your editor)
nano api/.env.production.local
```

**Required secrets**:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - Generate with: `openssl rand -base64 32`
- Auth0 credentials
- PayMongo credentials

## 4️⃣ Deploy (10 min)

```bash
# Run initial setup
bash scripts/setup-prod.sh

# Start services
docker compose -f docker-compose.prod.yml up -d

# Wait 10 seconds for services to start
sleep 10

# Run database migrations
docker compose -f docker-compose.prod.yml exec api npm run migration:run

# Verify
bash scripts/health-check.sh https://api.your-domain.com
```

## 5️⃣ Enable HTTPS (10 min)

```bash
# Install Certbot
sudo apt-get install certbot

# Get certificate
sudo certbot certonly --standalone -d your-domain.com -d api.your-domain.com

# Update nginx.conf to use SSL cert paths
# Then restart nginx inside the container
```

---

## ✅ Deployment Verification Checklist

- [ ] Frontend loads at `https://your-domain.com`
- [ ] API responds at `https://api.your-domain.com/api/users/me`
- [ ] Auth0 login works
- [ ] SSL certificate is valid (no browser warnings)
- [ ] PayMongo webhook is receiving events

---

## 🔧 Common Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f api

# Restart services
docker compose -f docker-compose.prod.yml restart

# Backup database
bash scripts/backup-db.sh

# Update code
git pull && docker compose -f docker-compose.prod.yml up -d --build
```

---

## 📚 Full Documentation

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete setup guide and [PRODUCTION_CHECKLIST.md](./PRODUCTION_CHECKLIST.md) for pre-launch verification.

---

**Questions?** Check `DEPLOYMENT.md` section 8 (Troubleshooting) or review logs: `docker compose logs -f`
