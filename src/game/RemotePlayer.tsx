import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useMultiplayer } from './multiplayer'
import type { RemotePlayer as RP } from './multiplayer'
import { KIND_INFO } from './store'
import type { ProjectileKind } from './store'

export function RemotePlayers() {
  const players = useMultiplayer((s) => s.players)
  return (
    <group>
      {players.map((p) => (
        <RemoteAvatar key={p.id} player={p} />
      ))}
    </group>
  )
}

function RemoteAvatar({ player }: { player: RP }) {
  const ref = useRef<THREE.Group>(null)
  const target = useRef(new THREE.Vector3(player.x, player.y, player.z))
  const targetRy = useRef(player.ry)

  useFrame((_, dt) => {
    if (!ref.current) return
    target.current.set(player.x, player.y, player.z)
    targetRy.current = player.ry
    // Lerp toward target for smoothing (10 Hz network → 60 Hz render)
    ref.current.position.lerp(target.current, Math.min(1, dt * 12))
    const cur = ref.current.rotation.y
    let diff = targetRy.current - cur
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    ref.current.rotation.y = cur + diff * Math.min(1, dt * 12)
  })

  return (
    <group ref={ref} position={[player.x, player.y, player.z]}>
      {/* Head */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color="#fbbf24" roughness={0.6} />
      </mesh>
      {/* Body (offset DOWN from eye-level since position is at eye height) */}
      <mesh position={[0, -0.55, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.7, 8, 16]} />
        <meshStandardMaterial color="#3b82f6" roughness={0.7} />
      </mesh>
      {/* Front indicator (so you can tell which way they're facing) */}
      <mesh position={[0, 0.05, -0.18]}>
        <boxGeometry args={[0.06, 0.06, 0.04]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* Name tag */}
      <Html position={[0, 0.5, 0]} center distanceFactor={8} occlude={false}>
        <div
          style={{
            background: 'rgba(0,0,0,0.65)',
            color: '#fafafa',
            padding: '2px 8px',
            borderRadius: 4,
            fontSize: 12,
            fontFamily: 'system-ui, sans-serif',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: '1px solid rgba(255,255,255,0.2)',
          }}
        >
          {player.name}
          {player.kind && KIND_INFO[player.kind as ProjectileKind] && (
            <span style={{ marginLeft: 6, opacity: 0.9 }}>
              {KIND_INFO[player.kind as ProjectileKind].emoji}
            </span>
          )}
        </div>
      </Html>
    </group>
  )
}
