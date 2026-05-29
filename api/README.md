# Wall of Anger — API

NestJS + Postgres + Auth0 + PayMongo.

## Endpoints

| Method | Path                       | Auth | Purpose |
|--------|----------------------------|------|---------|
| GET    | `/api/users/me`            | JWT  | Get / provision the current user |
| GET    | `/api/credits/balance`     | JWT  | Current credit balance |
| POST   | `/api/credits/spend`       | JWT  | Server-authoritative spend `{ amount, kind }` |
| GET    | `/api/credits/history`     | JWT  | Recent ledger entries |
| POST   | `/api/payments/checkout`   | JWT  | Start a PayMongo Checkout Session for `{ packId }` → returns `checkoutUrl` |
| POST   | `/api/payments/webhook`    | sig  | PayMongo webhook receiver (HMAC-SHA256 verified) |

## Local dev

```bash
cd api
cp .env.example .env
# fill AUTH0_*, PAYMONGO_*, DATABASE_URL

# from project root, start Postgres
docker compose up -d postgres

npm install
npm run start:dev
```

Schema is created via TypeORM `synchronize` in dev. For prod, generate migrations:

```bash
npm run migration:generate -- src/migrations/Init
npm run migration:run
```

## Auth0 setup

1. Create an **API** in Auth0 (Applications → APIs).
2. Set `AUTH0_AUDIENCE` to that API's identifier (e.g. `https://api.wallofanger.app`).
3. Frontend obtains an access token via Auth0's Universal Login and sends it as `Authorization: Bearer <token>`.

## PayMongo setup

1. Create a **Checkout Sessions** secret key in the PayMongo dashboard.
2. Create a **Webhook** pointing to `https://your-api/api/payments/webhook` subscribed to:
   - `checkout_session.payment.paid`
   - `payment.paid`
   - `payment.failed`
3. Put the webhook's signing secret into `PAYMONGO_WEBHOOK_SECRET`.

Webhook signature verification reads `Paymongo-Signature` (`t=`, `li=` or `te=`) and HMAC-SHA256s `${t}.${rawBody}` with the secret. The route uses Express raw body parser; tampered payloads are rejected.

## VPS deploy (Ubuntu)

One-time on the VPS:

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin rsync
mkdir -p /opt/wallofanger
# put .env (the api/.env) here once, or mount via env_file
```

Then add these GitHub Actions secrets:

- `VPS_HOST` — IP or hostname
- `VPS_USER` — SSH user (e.g. `ubuntu`)
- `VPS_SSH_KEY` — private key
- `VPS_APP_DIR` — e.g. `/opt/wallofanger`

Pushing to `main` will rsync the repo + `docker compose up -d --build`.

## Credit packs (server-authoritative)

| Pack ID    | Pesos | Credits | Effective rate |
|------------|-------|---------|----------------|
| starter    | ₱30   | 300     | ₱0.100 / credit |
| casual     | ₱75   | 800     | ₱0.094 / credit (+7%) |
| angry      | ₱150  | 1,700   | ₱0.088 / credit (+13%) |
| furious    | ₱300  | 3,600   | ₱0.083 / credit (+20%) |
| unhinged   | ₱500  | 6,500   | ₱0.077 / credit (+30%) |

Per-throw credit costs live in the frontend `KIND_INFO` and must match server expectations on `/credits/spend`.
