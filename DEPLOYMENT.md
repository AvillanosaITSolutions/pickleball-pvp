# Deployment Guide — Rageroom (Traefik + Shared VPS)

Rageroom deploys to a shared VPS running **Traefik** + **Let's Encrypt** + **Shared Postgres**.
Uses **GHCR** (GitHub Container Registry) for Docker images and **GitHub Actions** for CI/CD.

## Architecture

```
                ┌──────────────────────────────────────┐
                │  GitHub Actions (deploy.yml)         │
                │   build api + web → push to GHCR     │
                │   SSH to VPS → compose pull && up    │
                └──────────────────────────────────────┘
                                  │
                                  ▼
       ┌─────────────────────────────────────────────────┐
       │  VPS 88.222.245.88 (Shared)                     │
       │  ┌────────────────────────────────────────────┐ │
       │  │  Traefik (80/443) — ACME / Let's Encrypt   │ │
       │  └────────────┬────────────────────────────────┤ │
       │               │                                 │ │
       │         ┌─────┴──────────────────────┐          │ │
       │         │  visa-reminder_default     │          │ │
       │         │  (external shared network) │          │ │
       │         ├─────────────┬──────────────┤          │ │
       │         │             │              │          │ │
       │      rageroom-web    rageroom-api       postgres        │ │
       │      (nginx)         (NestJS)         (shared)        │ │
       │                                                  │ │
       │     + other projects (sip-n-bite, etc)         │ │
       └─────────────────────────────────────────────────┘
```

---

## One-Time VPS Setup (Admin Only)

**Already done on the shared VPS** — just verify:

```bash
ssh root@88.222.245.88

# Traefik should be running
docker ps | grep traefik

# Shared network should exist
docker network ls | grep visa-reminder_default

# Shared postgres should be running
docker ps | grep postgres
```

If Traefik is not running, see the sip-n-bite-nutrition DEPLOY.md.

---

## GitHub Secrets Configuration

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Value | Example |
|--------|-------|---------|
| `VPS_HOST` | VPS IP or hostname | `88.222.245.88` |
| `VPS_USER` | SSH user | `deploy` |
| `VPS_SSH_KEY_1` | Private key (file content with BEGIN/END lines) | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `GHCR_REPO` | GitHub Container Registry base path | `ghcr.io/YOUR-ORG/rageroom` |
| `POSTGRES_USER` | Shared DB user | `postgres` |
| `POSTGRES_PASSWORD` | Shared DB password | `(get from sip-n-bite admin)` |
| `POSTGRES_DB` | Shared DB name | `wallofanger` |
| `AUTH0_DOMAIN` | Auth0 tenant domain | `your-tenant.us.auth0.com` |
| `AUTH0_AUDIENCE` | Auth0 API audience | `https://api.your-domain.com` |
| `PAYMONGO_SECRET_KEY` | PayMongo live secret key | `sk_live_xxx` |
| `PAYMONGO_WEBHOOK_SECRET` | PayMongo webhook secret | `whsec_xxx` |
| `JWT_SECRET` | Random 32+ char secret | `$(openssl rand -base64 32)` |

### Generate SSH Key for CI

```bash
# On your workstation
ssh-keygen -t ed25519 -f gh-deploy-key -C "github-actions"

# Copy private key to GitHub secret
cat gh-deploy-key | pbcopy  # macOS
# or
cat gh-deploy-key | wl-copy  # Linux

# Add public key to VPS
ssh root@88.222.245.88
mkdir -p /home/deploy/.ssh
cat >> /home/deploy/.ssh/authorized_keys <<EOF
<paste-public-key-here>
EOF
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

---

## Deploying (Fully Automated)

1. **Ensure all GitHub secrets are set** (see above).

2. **Push to main branch**:
   ```bash
   git push origin main
   ```

3. **GitHub Actions will**:
   - Build `api` and `web` images
   - Push to GHCR
   - SCP docker-compose.prod.yml to VPS
   - SSH into VPS
   - Pull latest images
   - Bring up containers with `docker compose up -d`
   - Traefik automatically routes and issues HTTPS certs

4. **Check deployment**:
   ```bash
   # View live logs
   ssh deploy@88.222.245.88
   cd ~/rageroom
   docker compose -f docker-compose.prod.yml logs -f
   ```

---

## Deployment URLs

After successful deploy, services are available at:

| Service | URL |
|---------|-----|
| Web (Frontend) | `https://rageroom.88.222.245.88.sslip.io` |
| API | `https://api-rageroom.88.222.245.88.sslip.io` |

**Note**: Using free sslip.io SSL (no custom domain needed for testing).

---

## Environment Variables

The deployment generates these on the VPS from GitHub secrets:

```bash
~/rageroom/.env
├── IMAGE_TAG          (from git SHA, e.g., abc1234)
├── GHCR_REPO          (your container registry)
├── POSTGRES_*         (shared database)
├── AUTH0_*            (Auth0 config)
├── PAYMONGO_*         (payment service)
└── JWT_SECRET         (API authentication)
```

These are passed to `docker compose` as environment variables, which are then used in service definitions.

---

## Manual Deployment (if CI/CD fails)

If GitHub Actions deployment fails:

```bash
ssh deploy@88.222.245.88
cd ~/rageroom

# Copy docker-compose.prod.yml manually if needed
scp docker-compose.prod.yml deploy@88.222.245.88:~/rageroom/

# Create .env with secrets (ask admin for values)
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
JWT_SECRET=your_secret_here
EOF

chmod 600 .env

# Login to GHCR
echo "YOUR_PAT" | docker login ghcr.io -u YOUR-USERNAME --password-stdin

# Pull and deploy
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --remove-orphans
```

---

## Monitoring & Maintenance

### View Logs

```bash
ssh deploy@88.222.245.88
cd ~/rageroom
docker compose -f docker-compose.prod.yml logs -f [service]
# e.g., docker compose -f docker-compose.prod.yml logs -f api
```

### Check Status

```bash
docker compose -f docker-compose.prod.yml ps
```

### Stop Services

```bash
docker compose -f docker-compose.prod.yml down
```

### Restart Services

```bash
docker compose -f docker-compose.prod.yml restart
```

### View Traefik Dashboard

On the VPS:
```bash
docker ps | grep traefik
# Access at http://88.222.245.88:8080 (if configured)
```

---

## Shared Database Maintenance

**Important**: The PostgreSQL instance is shared with other projects!

### Backup Rageroom Database Only

```bash
ssh deploy@88.222.245.88

docker exec visa-reminder-postgres pg_dump -U postgres wallofanger | gzip > rageroom-backup-$(date +%Y%m%d).sql.gz
```

### Database Migrations

Migrations are run automatically on API startup (TypeORM `synchronize` in dev, or migrations in prod).

To run migrations manually:

```bash
cd ~/rageroom
docker compose -f docker-compose.prod.yml exec api npm run migration:run
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Deployment fails in GitHub Actions** | Check workflow logs: Actions tab → deploy job → see full logs |
| **Images not pulling from GHCR** | Verify `GHCR_REPO` secret and `docker login` credentials |
| **HTTPS cert not issuing** | Traefik needs external network. Check: `docker network ls \| grep visa-reminder_default` |
| **API not responding** | Check: `docker compose logs api` for startup errors |
| **Database connection failed** | Verify `POSTGRES_USER`, `POSTGRES_PASSWORD`, database name, and host reachability |
| **PayMongo webhook not firing** | Verify webhook URL is publicly accessible: `curl https://api-rageroom.88.222.245.88.sslip.io/api/payments/webhook` |
| **Out of disk space** | `docker system prune -a` (careful!) or contact admin |

---

## Rollback

If deployment breaks:

```bash
ssh deploy@88.222.245.88
cd ~/rageroom

# Revert to previous image tag
echo "IMAGE_TAG=previous_sha" >> .env
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Or manually edit `.env` and restart.

---

## Security

✅ **Do**:
- Rotate `JWT_SECRET` and `POSTGRES_PASSWORD` quarterly
- Keep GitHub SSH key secure
- Never commit `.env` to git
- Review container logs for errors
- Use strong PAYMONGO credentials

❌ **Don't**:
- Commit GitHub secrets to repo
- Share VPS credentials in chat
- Use test PayMongo keys in production
- Run containers as root

---

## Next: Custom Domain Setup

To use your own domain instead of sslip.io:

1. Point DNS A records to VPS IP (88.222.245.88)
2. Update Traefik labels in `docker-compose.prod.yml`
3. Update GitHub Actions build args for `VITE_API_BASE_URL`
4. Re-deploy

---

## Support

- **Traefik Docs**: https://doc.traefik.io/
- **Docker Docs**: https://docs.docker.com/
- **GHCR Docs**: https://docs.github.com/en/packages/working-with-a-github-packages-registry
- **sip-n-bite DEPLOY.md**: See parent project for shared infrastructure setup

---

**Last Updated**: May 2026
