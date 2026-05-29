# Deployment Migration Guide

Migrating from standalone to shared VPS deployment using Traefik.

## What Changed

Your deployment setup has been **completely redesigned** to use the same infrastructure as **sip-n-bite-nutrition**, leveraging the shared VPS's Traefik instance.

### Comparison

| | Standalone | Shared Traefik |
|---|-----------|---|
| **Reverse Proxy** | Nginx (our own) | Traefik (shared) |
| **SSL Certs** | Manual Certbot | Auto Let's Encrypt |
| **Docker Registry** | None (local build) | GHCR |
| **CI/CD** | Manual rsync + SSH | GitHub Actions |
| **Database** | Our own Postgres | Shared Postgres |
| **Deployment Speed** | ~5-10 min | ~60-90 sec |
| **Hostname** | Custom domain only | sslip.io or custom |

---

## New Deployment Flow

```
Your code (git push)
    ↓
GitHub Actions
    ├─ Build api image
    ├─ Build web image
    └─ Push both to GHCR
        ↓
    SSH into VPS (88.222.245.88)
        ├─ Generate .env from secrets
        ├─ docker compose pull
        └─ docker compose up -d
            ↓
    Traefik automatically:
        ├─ Routes traffic by hostname
        ├─ Issues HTTPS certs
        └─ Terminates SSL
            ↓
        Your app is live! 🚀
```

---

## Files Updated/Created

### Core Deployment Files
| File | Status | Purpose |
|------|--------|---------|
| `docker-compose.prod.yml` | ✅ UPDATED | Uses Traefik labels + external network |
| `.github/workflows/deploy.yml` | ✅ UPDATED | GitHub Actions: build → GHCR → deploy |
| `DEPLOYMENT.md` | ✅ UPDATED | Complete Traefik-based setup guide |
| `SHARED_VPS_SETUP.md` | ✅ NEW | Comprehensive shared VPS reference |

### Infrastructure Scripts
| File | Status | Purpose |
|------|--------|---------|
| `scripts/vps-bootstrap.sh` | ✅ UPDATED | One-time VPS setup (now for shared) |
| Other scripts | ✅ PRESERVED | Still available for reference |

### Dockerfile & Config
| File | Status | Purpose |
|------|--------|---------|
| `Dockerfile` | ✅ KEPT | Frontend build (unchanged) |
| `nginx.conf` | ✅ KEPT | Not used by Traefik, kept for reference |
| `.env.production` | ✅ KEPT | Frontend env template |

---

## Next Steps: Setup for Deployment

### 1. ⚠️ Prerequisites (One-Time)

**VPS Admin** needs to verify:
```bash
ssh root@88.222.245.88

# Check Traefik is running
docker ps | grep traefik

# Check shared network exists
docker network ls | grep visa-reminder_default

# Check shared Postgres exists
docker ps | grep postgres
```

If any are missing, see sip-n-bite-nutrition's `DEPLOY.md`.

### 2. 🔑 Generate SSH Key for CI/CD

```bash
# On your workstation
ssh-keygen -t ed25519 -f gh-deploy-key -C "rageroom-github-actions"

# Public key to VPS
ssh root@88.222.245.88
cat >> /home/deploy/.ssh/authorized_keys < [PUBLIC_KEY_PATH]
```

### 3. 📝 Set GitHub Secrets

In your repository: **Settings → Secrets and variables → Actions**

**Required secrets**:
```
VPS_HOST          = 88.222.245.88
VPS_USER          = deploy
VPS_SSH_KEY       = [PRIVATE_KEY_CONTENT_HERE]
GHCR_REPO         = ghcr.io/YOUR-ORG/rageroom
POSTGRES_USER     = postgres
POSTGRES_PASSWORD = [ASK_VPS_ADMIN]
POSTGRES_DB       = wallofanger
AUTH0_DOMAIN      = your-tenant.us.auth0.com
AUTH0_AUDIENCE    = https://api-rageroom.88.222.245.88.sslip.io
PAYMONGO_SECRET_KEY    = sk_live_xxx
PAYMONGO_WEBHOOK_SECRET = whsec_xxx
JWT_SECRET        = [GENERATE: openssl rand -base64 32]
```

### 4. 🚀 Deploy

Push to main and GitHub Actions handles everything:
```bash
git push origin main
```

Check progress in **Actions** tab of GitHub.

---

## Important: API Dockerfile

The API Dockerfile might need updating. Check if it exists:

```bash
# If you don't have one
cat api/Dockerfile
```

**Required structure**:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci && npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3001
CMD ["node", "dist/main"]
```

If you don't have this, create it.

---

## Access After Deploy

Once deployed, your app will be available at:

```
Frontend:  https://rageroom.88.222.245.88.sslip.io
API:       https://api-rageroom.88.222.245.88.sslip.io
```

To use a custom domain, update the Traefik labels in `docker-compose.prod.yml` and point DNS to the VPS.

---

## Manual Verification

After first deploy, verify everything works:

```bash
# Check containers are running
ssh deploy@88.222.245.88
cd ~/rageroom
docker compose -f docker-compose.prod.yml ps

# Check API responds
curl https://api-rageroom.88.222.245.88.sslip.io/api/users/me

# Check frontend loads
curl -I https://rageroom.88.222.245.88.sslip.io

# View logs if issues
docker compose -f docker-compose.prod.yml logs -f
```

---

## Rollback (if needed)

If something breaks after deploy:

```bash
# Option 1: Manual rollback on VPS
ssh deploy@88.222.245.88
cd ~/rageroom
git log --oneline | head -5  # Find previous commit
git reset --hard <commit>
git pull
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d

# Option 2: Revert commit and re-push
git revert <bad-commit>
git push origin main
# GitHub Actions will auto-deploy the reverted code
```

---

## Environment Variables Reference

The `.env` file generated on the VPS will contain:

```bash
# From GitHub secrets
IMAGE_TAG=abc1234                    # Git SHA (short)
GHCR_REPO=ghcr.io/your-org/...
POSTGRES_USER=postgres
POSTGRES_PASSWORD=xxx
POSTGRES_DB=wallofanger

# Service config
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api-rageroom...
PAYMONGO_SECRET_KEY=sk_live_xxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxx
JWT_SECRET=xxx
```

These are passed to containers via `docker-compose.prod.yml`.

---

## Documentation

Read these in order:

1. **`SHARED_VPS_SETUP.md`** - Comprehensive reference (start here)
2. **`DEPLOYMENT.md`** - Traefik-specific deployment guide
3. **`PRODUCTION_CHECKLIST.md`** - Pre-launch verification (optional, for custom domain)

---

## Common Issues

| Problem | Solution |
|---------|----------|
| "GitHub Actions won't deploy" | Check: VPS_SSH_KEY secret is set + contains BEGIN/END lines |
| "Containers won't start" | Check logs: `docker compose logs api` |
| "Database connection failed" | Verify POSTGRES_PASSWORD is correct |
| "HTTPS cert not issuing" | Wait 5 min for Let's Encrypt. Check Traefik logs |
| "API not accessible" | Verify internal port 3001 in docker-compose.prod.yml |

---

## What's the Same

✅ **Code is unchanged** — no application changes needed
✅ **Auth0 still works** — same configuration
✅ **PayMongo still works** — same secrets
✅ **Database still works** — migrates to shared instance (same schema)
✅ **Splatter effects still work** — no changes
✅ **Game logic is identical** — just different deployment method

---

## Support

If you hit issues:

1. Check `SHARED_VPS_SETUP.md` troubleshooting section
2. Review GitHub Actions logs (Actions tab)
3. SSH into VPS and check Docker logs
4. Ask VPS admin about shared infrastructure

---

## Summary of Changes

🎯 **What you do**: Push to main
🤖 **What GitHub Actions does**: Builds, tests, publishes, deploys
⚡ **Result**: App live in ~60-90 seconds with HTTPS

No more manual rsync, no more Certbot, no more Nginx config. Traefik handles it all!

---

**Ready to deploy?** Start with Step 2 above (Generate SSH Key).
