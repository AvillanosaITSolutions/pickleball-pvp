# Rageroom Deployment — Shared VPS Setup

Deployment adapted from sip-n-bite-nutrition's proven Traefik + GHCR setup.

## Key Differences from Standalone Setup

| Aspect | Standalone | Shared VPS (Traefik) |
|--------|-----------|---------------------|
| **Reverse Proxy** | Nginx (our own) | Traefik (shared) |
| **SSL Certs** | Certbot (manual) | Let's Encrypt (auto via Traefik) |
| **Registry** | Local build | GitHub Container Registry (GHCR) |
| **CI/CD** | Manual rsync | GitHub Actions (automated) |
| **Database** | Own Postgres | Shared Postgres (wallofanger) |
| **Network** | `app` (local) | `visa-reminder_default` (external) |
| **Deployment** | SSH + rsync | GitHub Actions only |
| **DNS** | Custom domain | sslip.io (free) or custom domain |
| **Ports** | 80, 443 (nginx) | API: 3001, Web: 80 (internal) |

---

## Architecture: Shared VPS

```
┌─────────────────────────────────────────────────────────────┐
│ VPS 88.222.245.88 (Shared Instance)                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Traefik (80:80, 443:443)                             │   │
│  │ ├─ Let's Encrypt ACME resolver                       │   │
│  │ └─ Routes by hostname + TLS termination              │   │
│  └────────────┬────────────────────────────────────────┘   │
│               │                                             │
│  ┌────────────┴─── visa-reminder_default (external) ──────┐ │
│  │                                                         │ │
│  ├─ rageroom-api (port 3001)                                  │ │
│  │  ├─ Hostname: api-rageroom.88.222.245.88.sslip.io  │ │
│  │  └─ Route: Host(`api-rageroom...`)                  │ │
│  │                                                         │ │
│  ├─ rageroom-web (port 80)                                    │ │
│  │  ├─ Hostname: rageroom.88.222.245.88.sslip.io      │ │
│  │  └─ Route: Host(`rageroom...`)                      │ │
│  │                                                         │ │
│  ├─ visa-reminder-postgres (port 5432, local only)        │ │
│  │  └─ Shared database for multiple projects             │ │
│  │                                                         │ │
│  └─ [other projects: snb-api, snb-web, etc.]             │ │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## GitHub Actions Workflow

When you `git push origin main`:

1. **Build stage** (runs on GitHub runners)
   - Checkout code
   - Build `api` image → push to GHCR
   - Build `web` image → push to GHCR

2. **Deploy stage** (runs after build succeeds)
   - SCP `docker-compose.prod.yml` to VPS
   - SSH into VPS
   - Generate `.env` from GitHub secrets
   - Run `docker compose pull` + `docker compose up -d`
   - Traefik picks up new containers and issues certs

**Total time**: ~3 min (first deploy, including cert issuance) → ~60s (cached rebuilds)

---

## GitHub Secrets Required

Store these in your GitHub repository at **Settings → Secrets and variables → Actions**:

```yaml
VPS_HOST:               88.222.245.88
VPS_USER:               deploy
VPS_SSH_KEY:            -----BEGIN OPENSSH PRIVATE KEY-----
                        (multi-line private key)
                        -----END OPENSSH PRIVATE KEY-----

GHCR_REPO:              ghcr.io/YOUR-ORG/rageroom

POSTGRES_USER:          postgres
POSTGRES_PASSWORD:      (shared DB password)
POSTGRES_DB:            wallofanger

AUTH0_DOMAIN:           your-tenant.us.auth0.com
AUTH0_AUDIENCE:         https://api-rageroom.88.222.245.88.sslip.io

PAYMONGO_SECRET_KEY:    sk_live_xxx
PAYMONGO_WEBHOOK_SECRET: whsec_xxx

JWT_SECRET:             (random 32+ chars)
```

### Generate VPS SSH Key

```bash
# Create new SSH key
ssh-keygen -t ed25519 -f gh-deploy-key -C "github-actions"

# Add public key to VPS
ssh root@88.222.245.88
cat >> /home/deploy/.ssh/authorized_keys < gh-deploy-key.pub

# Copy private key content to GitHub secret VPS_SSH_KEY
cat gh-deploy-key
# (includes BEGIN/END lines, paste entire thing)
```

---

## Deployment Hostnames

After deploy, your app is available at:

```
Frontend:  https://rageroom.88.222.245.88.sslip.io
API:       https://api-rageroom.88.222.245.88.sslip.io
```

**sslip.io** is a free DNS service that returns `88.222.245.88` for any hostname matching that IP.
- No DNS configuration needed
- Valid HTTPS certificates (Let's Encrypt)
- Perfect for testing/staging

**To use custom domain** (e.g., `rageroom.com`):
1. Point DNS A record to `88.222.245.88`
2. Update Traefik labels in `docker-compose.prod.yml`
3. Traefik auto-issues new certs for your domain

---

## Container Port Mapping

| Container | Internal Port | Traefik Route | External HTTPS |
|-----------|---------------|---------------|-----------------|
| `rageroom-api` | 3001 | `api-rageroom...` | 443 (auto) |
| `rageroom-web` | 80 | `rageroom...` | 443 (auto) |

**Note**: Only Traefik ports (80, 443) are exposed to the internet. API/web container ports are internal to the Docker network.

---

## Docker Compose Labels (Traefik Integration)

Containers use Traefik labels for automatic routing:

```yaml
labels:
  - "traefik.enable=true"                    # Enable Traefik for this service
  - "traefik.docker.network=visa-reminder_default"  # Use shared network
  - "traefik.http.routers.rageroom-api.rule=Host(`api-rageroom...`)"  # Match hostname
  - "traefik.http.routers.rageroom-api.entrypoints=websecure"  # HTTPS only
  - "traefik.http.routers.rageroom-api.tls=true"  # Enable TLS
  - "traefik.http.routers.rageroom-api.tls.certresolver=letsencrypt"  # Use LE certs
  - "traefik.http.services.rageroom-api.loadbalancer.server.port=3001"  # Container port
```

When Traefik sees these labels, it automatically:
1. Routes traffic from `api-rageroom...` → `rageroom-api:3001`
2. Requests SSL cert for that hostname
3. Sets up HTTPS on port 443
4. Redirects HTTP → HTTPS

---

## Deploying (Step-by-Step)

### First-Time Setup

1. **Fork the repo** and clone locally
2. **Set GitHub secrets** (see above)
3. **Push to main**:
   ```bash
   git push origin main
   ```
4. **Monitor Actions tab** for build/deploy progress
5. **Access frontend** when deploy completes:
   ```
   https://rageroom.88.222.245.88.sslip.io
   ```

### Subsequent Deploys

Just push to main — GitHub Actions handles everything!

```bash
git commit -am "Update game mechanics"
git push origin main
# GitHub Actions automatically builds, tests, and deploys
```

### Manual Deploy (if Actions fails)

```bash
ssh deploy@88.222.245.88
cd ~/rageroom

# Pull latest code
git pull

# Copy compose file
scp docker-compose.prod.yml deploy@88.222.245.88:~/rageroom/

# Create .env from secrets (ask admin)
cat > .env <<EOF
IMAGE_TAG=latest
GHCR_REPO=ghcr.io/your-org/rageroom
POSTGRES_USER=postgres
POSTGRES_PASSWORD=xxxxx
POSTGRES_DB=wallofanger
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api-rageroom.88.222.245.88.sslip.io
PAYMONGO_SECRET_KEY=sk_live_xxxxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxxxx
JWT_SECRET=your_secret
EOF

chmod 600 .env

# Deploy
docker login ghcr.io
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## Monitoring & Debugging

### View Logs

```bash
ssh deploy@88.222.245.88
cd ~/rageroom

# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web

# Traefik logs (shared)
docker logs -f visa-reminder-traefik

# Postgres logs (shared)
docker logs -f visa-reminder-postgres
```

### Check Service Status

```bash
docker compose -f docker-compose.prod.yml ps

# Example output:
# NAME         IMAGE                              STATUS
# rageroom-api     ghcr.io/.../api:abc1234           Up 2 minutes
# rageroom-web     ghcr.io/.../web:abc1234           Up 2 minutes
```

### Verify Traefik Routing

```bash
# Check if Traefik sees the containers
docker ps | grep traefik
docker logs visa-reminder-traefik | tail -20

# Check HTTPS cert
curl -I https://api-rageroom.88.222.245.88.sslip.io
# Should show: HTTP/2 200 and valid certificate
```

---

## Updating Environment Variables

To update a secret (e.g., PayMongo keys):

1. **Update GitHub secret** (Settings → Secrets)
2. **Trigger new deploy**:
   ```bash
   git push origin main  # or manual trigger in Actions
   ```
3. **New `.env` is generated** on VPS with updated values
4. **Containers restart** and pick up new env vars

No manual VPS editing needed — all controlled via GitHub!

---

## Troubleshooting

### "Cannot connect to Docker daemon"

```bash
ssh deploy@88.222.245.88
sudo usermod -aG docker deploy
# Log out and back in
```

### "Network visa-reminder_default not found"

Traefik must be running first. Ask VPS admin to verify:
```bash
docker network ls | grep visa-reminder_default
docker ps | grep traefik
```

### "API container keeps restarting"

```bash
docker compose -f docker-compose.prod.yml logs api
# Look for startup errors in logs
```

### "Database connection refused"

Verify shared Postgres is running:
```bash
docker ps | grep postgres
# If not running, ask VPS admin to start it
```

### "HTTPS cert not issued"

Wait 5-10 minutes for Let's Encrypt challenge to complete. Check Traefik logs:
```bash
docker logs visa-reminder-traefik | grep "api-rageroom"
```

---

## Shared VPS Etiquette

Since this is a shared VPS with other projects:

✅ **Do**:
- Only manage your own containers (`rageroom-*`)
- Use allocated database/namespace
- Check available disk space before large uploads
- Ask before making changes to shared infrastructure

❌ **Don't**:
- Restart Traefik or Postgres (affects other projects)
- Change shared network settings
- Delete other projects' containers/volumes
- Run resource-intensive jobs without warning

**Admin contact**: [VPS admin email]

---

## Migration from Standalone to Shared

If you previously deployed standalone, migrating is straightforward:

1. **Same codebase** — no changes needed
2. **New deploy flow** — GitHub Actions instead of manual rsync
3. **Same services** — API, web, database (now shared)
4. **Same configuration** — Auth0, PayMongo still work

**Data migration**: Existing PostgreSQL database can be migrated to shared instance (ask admin).

---

## Rollback

If a deploy breaks:

```bash
ssh deploy@88.222.245.88
cd ~/rageroom

# Revert to previous commit/tag
git log --oneline | head
git reset --hard <previous-commit>

# Or use previous image tag
echo "IMAGE_TAG=previous_sha" >> .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Or trigger a revert commit:
```bash
git revert <bad-commit>
git push origin main
# GitHub Actions will deploy the reverted code
```

---

## Performance Notes

- **Image builds**: ~3 min (first) → ~60s (cached)
- **Traefik cert issuance**: ~30s (first time) → instant (cached)
- **API startup**: ~5s
- **Total deploy time**: ~3-5 min (first) → ~90s (subsequent)

---

## Resources

- **Traefik Docs**: https://doc.traefik.io/traefik/
- **Docker Compose**: https://docs.docker.com/compose/
- **GHCR (GitHub Container Registry)**: https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
- **sslip.io**: https://sslip.io/ (free dynamic DNS)
- **sip-n-bite-nutrition**: Reference deployment (same VPS setup)

---

**Last Updated**: May 29, 2026
