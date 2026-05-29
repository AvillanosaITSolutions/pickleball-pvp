# Production Deployment Checklist

Complete this checklist before deploying to production.

## Infrastructure Setup (⏱️ 30-60 min)

### Hosting Provider
- [ ] Server provisioned (Linux recommended: Ubuntu 22.04 LTS or similar)
- [ ] Minimum specs: 2 CPU, 2GB RAM, 10GB storage
- [ ] SSH access configured
- [ ] Docker & Docker Compose installed
- [ ] Git installed

### Networking
- [ ] Domain registered and DNS configured
- [ ] SSL certificate obtained (Let's Encrypt recommended)
- [ ] Firewall configured (only ports 80, 443 public)
- [ ] API rate limiting considered

### Database
- [ ] PostgreSQL database created or managed service provisioned
- [ ] Database user created with strong password
- [ ] Connection string documented
- [ ] Backups scheduled (daily minimum)

---

## Third-Party Services Setup (⏱️ 45-90 min)

### Auth0
- [ ] Auth0 tenant created
- [ ] API created with proper identifier
- [ ] Application created for frontend
- [ ] Allowed callback URLs set to production domain
- [ ] Allowed logout URLs configured
- [ ] Credentials saved securely (AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_ISSUER)
- [ ] JWT token verification tested locally

### PayMongo
- [ ] Live API keys obtained (not test keys)
- [ ] Webhook endpoint configured
- [ ] Webhook subscriptions: `checkout_session.payment.paid`, `payment.paid`, `payment.failed`
- [ ] Webhook signing secret saved
- [ ] Success/cancel redirect URLs set
- [ ] Test payment flow locally

---

## Code & Configuration (⏱️ 20-30 min)

### Environment Files
- [ ] `api/.env.production` created with all required variables:
  - [ ] NODE_ENV=production
  - [ ] DATABASE_URL with production database
  - [ ] DATABASE_SSL=true
  - [ ] AUTH0_* variables
  - [ ] PAYMONGO_* variables (LIVE keys)
  - [ ] JWT_SECRET generated (32+ random chars)
  - [ ] API_PUBLIC_URL correct
  - [ ] PUBLIC_URL correct
- [ ] `.env.production` created if needed for frontend build
- [ ] NO secrets committed to git

### Build Verification
- [ ] `npm run build` completes without errors
- [ ] API `npm run build` completes without errors
- [ ] TypeScript compilation has no errors
- [ ] ESLint passes (`npm run lint`)
- [ ] All dependencies up-to-date

### Docker Configuration
- [ ] Dockerfile builds successfully
- [ ] nginx.conf routing correct
- [ ] docker-compose.prod.yml uses production images
- [ ] Health checks configured
- [ ] Resource limits set (CPU, memory)

---

## Deployment (⏱️ 15-20 min)

### Pre-Deployment
- [ ] Backup existing database (if upgrade)
- [ ] Test rollback plan locally
- [ ] Document deployment commands
- [ ] Have terminal open to server

### Deployment Steps
- [ ] Clone repository to server
- [ ] Copy production env file
- [ ] Build Docker images: `docker compose -f docker-compose.prod.yml build`
- [ ] Start services: `docker compose -f docker-compose.prod.yml up -d`
- [ ] Verify services are running: `docker compose ps`
- [ ] Check logs for errors: `docker compose logs api`
- [ ] Run migrations: `docker compose exec api npm run migration:run`

### SSL/HTTPS Setup
- [ ] SSL certificate installed
- [ ] Nginx/Traefik configured for HTTPS
- [ ] Redirect HTTP → HTTPS working
- [ ] SSL certificate auto-renewal configured
- [ ] Security headers added (X-Frame-Options, etc.)

---

## Testing & Verification (⏱️ 20-30 min)

### Frontend Verification
- [ ] [ ] Homepage loads at https://your-domain.com
- [ ] [ ] All static assets load (CSS, JS, images)
- [ ] [ ] No CORS errors in console
- [ ] [ ] No 404 errors
- [ ] [ ] Responsive design works on mobile
- [ ] [ ] All routes work (not just root)

### Auth0 Integration
- [ ] [ ] Login button appears
- [ ] [ ] Auth0 login redirects work
- [ ] [ ] User profile fetched correctly
- [ ] [ ] Logout works

### API Endpoints
- [ ] [ ] `GET /api/users/me` returns current user
- [ ] [ ] `GET /api/credits/balance` returns credits
- [ ] [ ] `POST /api/credits/spend` works
- [ ] [ ] Error handling returns proper status codes

### Payment Flow
- [ ] [ ] PayMongo checkout initiates
- [ ] [ ] Success redirect works
- [ ] [ ] Cancel redirect works
- [ ] [ ] Webhook receives events
- [ ] [ ] Credits updated after payment

### Performance
- [ ] [ ] Page load time < 3s
- [ ] [ ] API response time < 500ms
- [ ] [ ] No memory leaks (check `docker stats`)
- [ ] [ ] CSS gzipping working
- [ ] [ ] JS bundling optimized

### Security
- [ ] [ ] HTTPS only (no HTTP access)
- [ ] [ ] CORS properly restricted
- [ ] [ ] No sensitive data in console
- [ ] [ ] No hardcoded secrets visible
- [ ] [ ] Rate limiting working
- [ ] [ ] SQL injection prevention verified
- [ ] [ ] XSS protection headers set

---

## Post-Deployment Monitoring (⏱️ 30 min)

### Logging & Monitoring
- [ ] [ ] Logs accessible: `docker compose logs -f`
- [ ] [ ] Error tracking configured (optional: Sentry)
- [ ] [ ] Performance monitoring set up (optional: New Relic)
- [ ] [ ] Uptime monitoring enabled (optional: Statuspage)

### Backups
- [ ] [ ] Database backup script working
- [ ] [ ] Automated backups scheduled (cron)
- [ ] [ ] Backup retention policy defined
- [ ] [ ] Restore from backup tested

### Maintenance
- [ ] [ ] Update schedule planned
- [ ] [ ] Security patches monitored
- [ ] [ ] Docker image updates tracked
- [ ] [ ] On-call schedule if needed

---

## Documentation & Runbooks (⏱️ 15 min)

- [ ] [ ] DEPLOYMENT.md up-to-date
- [ ] [ ] Emergency contacts documented
- [ ] [ ] Rollback procedure written
- [ ] [ ] API documentation available
- [ ] [ ] Troubleshooting guide created

### Team Handoff
- [ ] [ ] Team trained on deployment process
- [ ] [ ] SSH access granted to ops team
- [ ] [ ] Admin credentials shared securely
- [ ] [ ] Incident response plan documented

---

## Sign-Off

| Role | Name | Date | Sign-Off |
|------|------|------|----------|
| **Developer** | _______________ | __________ | ☐ |
| **DevOps/Ops** | _______________ | __________ | ☐ |
| **Product** | _______________ | __________ | ☐ |

---

## Post-Deployment (24-48 hours)

- [ ] Monitor error rates (target: < 0.1%)
- [ ] Monitor performance metrics
- [ ] User reports collected
- [ ] Incident response not needed
- [ ] Consider promotion to stable status

---

**Deployment Date**: ______________
**Deployed Version**: ______________
**Deployed By**: ______________
**Approved By**: ______________

---

## Quick Reference Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# Restart services
docker compose -f docker-compose.prod.yml restart

# Stop all
docker compose -f docker-compose.prod.yml down

# Database backup
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U postgres wallofanger | gzip > backup.sql.gz

# Health check
./scripts/health-check.sh https://api.your-domain.com
```

---

**Last Updated**: May 2026
