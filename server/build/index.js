"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@colyseus/core");
const ws_transport_1 = require("@colyseus/ws-transport");
const monitor_1 = require("@colyseus/monitor");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const GameRoom_1 = require("./GameRoom");
const SabongRoom_1 = require("./SabongRoom");
const port = Number(process.env.PORT ?? 2567);
const app = (0, express_1.default)();
app.use(express_1.default.json());
const server = http_1.default.createServer(app);
const gameServer = new core_1.Server({
    transport: new ws_transport_1.WebSocketTransport({ server }),
});
// Public lobby for matchmaking-style quickplay listings.
gameServer.define("lobby", core_1.LobbyRoom);
// One game mode for now — more modes register additional defines later.
gameServer.define("rage", GameRoom_1.GameRoom)
    .enableRealtimeListing();
gameServer.define("sabong", SabongRoom_1.SabongRoom)
    .enableRealtimeListing();
app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/monitor", (0, monitor_1.monitor)());
gameServer.listen(port);
console.log(`[rageroom-server] listening on :${port}`);
