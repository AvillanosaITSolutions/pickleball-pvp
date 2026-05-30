import { Schema, MapSchema, ArraySchema, type } from "@colyseus/schema";

export class Pose extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") ry = 0;
  @type("string") kind = "";
}

export class WorldSplat extends Schema {
  @type("number") id = 0;
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") z = 0;
  @type("number") nx = 0;
  @type("number") ny = 1;
  @type("number") nz = 0;
  @type("number") radius = 1;
  @type("string") color = "#000";
  @type("string") kind = "";
  @type("number") rotation = 0;
}

export class GameState extends Schema {
  @type("string") code = "";
  @type("string") mode = "rage";
  @type("string") photoUrl = "";
  @type({ map: Pose }) players = new MapSchema<Pose>();
  @type([WorldSplat]) splats = new ArraySchema<WorldSplat>();
}
