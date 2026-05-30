"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const core_1 = require("@colyseus/core");
const schema_1 = require("./schema");
const MAX_SPLATS = 400;
class GameRoom extends core_1.Room {
    constructor() {
        super(...arguments);
        this.maxClients = 8;
    }
    onCreate(options) {
        this.setState(new schema_1.GameState());
        this.state.code = this.roomId;
        if (options?.mode)
            this.state.mode = options.mode;
        this.onMessage("pose", (client, p) => {
            const pose = this.state.players.get(client.sessionId);
            if (!pose)
                return;
            pose.x = p.x;
            pose.y = p.y;
            pose.z = p.z;
            pose.ry = p.ry;
            if (p.kind)
                pose.kind = p.kind;
        });
        // Throws are ephemeral — broadcast to other clients, don't store.
        this.onMessage("throw", (client, spec) => {
            this.broadcast("throw", { from: client.sessionId, spec }, { except: client });
        });
        this.onMessage("worldSplat", (client, splat) => {
            const ws = new schema_1.WorldSplat();
            Object.assign(ws, splat);
            this.state.splats.push(ws);
            while (this.state.splats.length > MAX_SPLATS)
                this.state.splats.shift();
        });
        this.onMessage("photo", (_client, p) => {
            this.state.photoUrl = p?.url ?? "";
        });
    }
    onJoin(client, options) {
        const pose = new schema_1.Pose();
        pose.id = client.sessionId;
        pose.name = options?.name ?? "Player";
        this.state.players.set(client.sessionId, pose);
    }
    onLeave(client) {
        this.state.players.delete(client.sessionId);
    }
}
exports.GameRoom = GameRoom;
