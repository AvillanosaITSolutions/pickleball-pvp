"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameState = exports.WorldSplat = exports.Pose = void 0;
const schema_1 = require("@colyseus/schema");
class Pose extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "";
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.ry = 0;
        this.kind = "";
    }
}
exports.Pose = Pose;
__decorate([
    (0, schema_1.type)("string")
], Pose.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("string")
], Pose.prototype, "name", void 0);
__decorate([
    (0, schema_1.type)("number")
], Pose.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number")
], Pose.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number")
], Pose.prototype, "z", void 0);
__decorate([
    (0, schema_1.type)("number")
], Pose.prototype, "ry", void 0);
__decorate([
    (0, schema_1.type)("string")
], Pose.prototype, "kind", void 0);
class WorldSplat extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.id = 0;
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.nx = 0;
        this.ny = 1;
        this.nz = 0;
        this.radius = 1;
        this.color = "#000";
        this.kind = "";
        this.rotation = 0;
    }
}
exports.WorldSplat = WorldSplat;
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "id", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "x", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "y", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "z", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "nx", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "ny", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "nz", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "radius", void 0);
__decorate([
    (0, schema_1.type)("string")
], WorldSplat.prototype, "color", void 0);
__decorate([
    (0, schema_1.type)("string")
], WorldSplat.prototype, "kind", void 0);
__decorate([
    (0, schema_1.type)("number")
], WorldSplat.prototype, "rotation", void 0);
class GameState extends schema_1.Schema {
    constructor() {
        super(...arguments);
        this.code = "";
        this.mode = "rage";
        this.photoUrl = "";
        this.players = new schema_1.MapSchema();
        this.splats = new schema_1.ArraySchema();
    }
}
exports.GameState = GameState;
__decorate([
    (0, schema_1.type)("string")
], GameState.prototype, "code", void 0);
__decorate([
    (0, schema_1.type)("string")
], GameState.prototype, "mode", void 0);
__decorate([
    (0, schema_1.type)("string")
], GameState.prototype, "photoUrl", void 0);
__decorate([
    (0, schema_1.type)({ map: Pose })
], GameState.prototype, "players", void 0);
__decorate([
    (0, schema_1.type)([WorldSplat])
], GameState.prototype, "splats", void 0);
