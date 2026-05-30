import { Server, LobbyRoom } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { monitor } from "@colyseus/monitor";
import express from "express";
import http from "http";
import { GameRoom } from "./GameRoom";
import { SabongRoom } from "./SabongRoom";

const port = Number(process.env.PORT ?? 2567);
const app = express();
app.use(express.json());

const server = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server }),
});

// Public lobby for matchmaking-style quickplay listings.
gameServer.define("lobby", LobbyRoom);

// One game mode for now — more modes register additional defines later.
gameServer.define("rage", GameRoom)
  .enableRealtimeListing();

gameServer.define("sabong", SabongRoom)
  .enableRealtimeListing();

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/monitor", monitor());

gameServer.listen(port);
console.log(`[rageroom-server] listening on :${port}`);
