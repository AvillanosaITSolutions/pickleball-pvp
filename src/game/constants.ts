// Room dimensions (meters) — bigger room for more chaos & throwing room
export const ROOM = {
  width: 20,
  depth: 24,
  height: 6,
}

// The wall is the back wall (negative Z) — scaled with the room
export const WALL = {
  width: 12,
  height: 5.5,
  y: 2.75,
  z: -ROOM.depth / 2,
}

export const PLAYER = {
  eyeHeight: 1.7,
  startZ: ROOM.depth / 2 - 2,
  speed: 5, // faster to match bigger room
}

export const PROJECTILE = {
  radius: 0.12,
  mass: 0.4,
  minPower: 12,
  maxPower: 45,
  chargeTime: 0.7,
}
