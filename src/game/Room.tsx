import { RigidBody } from '@react-three/rapier'
import { Grid } from '@react-three/drei'
import { ROOM } from './constants'

export function Room() {
  const hw = ROOM.width / 2
  const hd = ROOM.depth / 2
  const h = ROOM.height

  return (
    <group>
      {/* Floor (physics) */}
      <RigidBody type="fixed" friction={0.9} restitution={0.2}>
        <mesh receiveShadow position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[ROOM.width, ROOM.depth]} />
          <meshStandardMaterial color="#d4d4d8" roughness={0.85} />
        </mesh>
      </RigidBody>

      {/* Neon grid overlay */}
      <Grid
        position={[0, 0.002, 0]}
        args={[ROOM.width, ROOM.depth]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#71717a"
        sectionSize={2}
        sectionThickness={1.0}
        sectionColor="#3f3f46"
        fadeDistance={20}
        fadeStrength={1}
        infiniteGrid={false}
        followCamera={false}
      />

      {/* Ceiling */}
      <mesh position={[0, h, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#0a0a0f" side={2} />
      </mesh>

      {/* Side walls */}
      <RigidBody type="fixed">
        <mesh position={[-hw, h / 2, 0]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM.depth, h]} />
          <meshStandardMaterial color="#a1a1aa" />
        </mesh>
      </RigidBody>
      <RigidBody type="fixed">
        <mesh position={[hw, h / 2, 0]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
          <planeGeometry args={[ROOM.depth, h]} />
          <meshStandardMaterial color="#a1a1aa" />
        </mesh>
      </RigidBody>

      {/* Front wall (behind player) */}
      <RigidBody type="fixed">
        <mesh position={[0, h / 2, hd]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[ROOM.width, h]} />
          <meshStandardMaterial color="#a1a1aa" />
        </mesh>
      </RigidBody>
    </group>
  )
}
