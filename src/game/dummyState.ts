import * as THREE from 'three'
import { ROOM } from './constants'

// Live world positions of the dummy body and head, updated each frame
// by Dummy.tsx and read on-demand by Player.tsx for raycasting.
export const dummyState = {
  bodyPos: new THREE.Vector3(0, 1, -ROOM.depth / 2 + 1.8),
  headPos: new THREE.Vector3(0, 2.05, -ROOM.depth / 2 + 1.8),
  // Rapier rigid-body handles, set by Dummy.tsx once the bodies exist.
  // Read by Player.fireGun to filter the rapier raycast — we don't want
  // the gun's physics raycast to short-circuit on the dummy bodies, because
  // we have dedicated dummy raycasts that produce splatters.
  bodyHandle: -1,
  headHandle: -1,
}

// Brief muzzle flash flag — set when the gun fires, read by HeldItem to flash.
export const fireFlash = { until: 0 }
