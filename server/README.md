# rageroom-server

Colyseus multiplayer server. Replaces the previous socket.io rooms.

## Local dev

```
cd server
npm install
npm run dev
```

Server listens on `ws://localhost:2567`. Client picks it up via `VITE_COLYSEUS_URL`
(defaults to `ws://localhost:2567`).

## Docker

From the repo root:

```
docker compose up --build
```

## Rooms

- `rage` — the original wall-of-anger / dummy room. New modes register as new `gameServer.define(...)` entries.
- `lobby` — public realtime listing of available rage rooms (used by quickplay UI).

## Endpoints

- `GET /health` — liveness probe
- `GET /monitor` — Colyseus dashboard (disable behind auth before prod)
