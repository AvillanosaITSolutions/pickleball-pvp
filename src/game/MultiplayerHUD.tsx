import { useEffect, useState } from 'react'
import { useMultiplayer } from './multiplayer'
import { createRoom, joinRoom } from './net'
import { crazyMakeInviteLink } from './crazygames'

export function MultiplayerHUD() {
  const code = useMultiplayer((s) => s.code)
  const players = useMultiplayer((s) => s.players)
  const myName = useMultiplayer((s) => s.myName)
  const setName = useMultiplayer((s) => s.setName)
  const [open, setOpen] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Auto-join via ?room=XXXXXX
  useEffect(() => {
    const url = new URL(window.location.href)
    const r = url.searchParams.get('room')?.toUpperCase()
    if (r && r.length === 6 && !code) {
      joinRoom(r, myName).then((res) => {
        if (!res.ok) setErr(res.error ?? 'join failed')
      })
    }
  }, [])

  const inviteUrl = code
    ? crazyMakeInviteLink({ roomCode: code }, `${window.location.origin}${window.location.pathname}?room=${code}`)
    : ''

  const handleCreate = async () => {
    setBusy(true); setErr(null)
    const res = await createRoom(myName)
    setBusy(false)
    if (!res.ok) setErr(res.error ?? 'failed')
  }
  const handleJoin = async () => {
    if (joinCode.length !== 6) { setErr('code must be 6 chars'); return }
    setBusy(true); setErr(null)
    const res = await joinRoom(joinCode.toUpperCase(), myName)
    setBusy(false)
    if (!res.ok) setErr(res.error ?? 'failed')
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 12,
        left: 12,
        zIndex: 50,
        color: '#fafafa',
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        userSelect: 'none',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          background: code ? 'rgba(34,197,94,0.85)' : 'rgba(0,0,0,0.6)',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: 6,
          padding: '6px 10px',
          cursor: 'pointer',
        }}
      >
        {code ? `Room ${code} • ${players.length + 1}` : 'Multiplayer'}
      </button>
      {open && (
        <div
          style={{
            marginTop: 6,
            background: 'rgba(0,0,0,0.85)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 6,
            padding: 10,
            width: 260,
          }}
        >
          <label style={{ display: 'block', marginBottom: 6 }}>
            Name
            <input
              value={myName}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              style={inputStyle}
            />
          </label>
          {code ? (
            <>
              <div style={{ marginBottom: 6 }}>
                Share this link:
              </div>
              <input
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={inputStyle}
              />
              <button
                style={btnStyle}
                onClick={() => navigator.clipboard?.writeText(inviteUrl)}
              >
                Copy link
              </button>
              <div style={{ marginTop: 8, opacity: 0.8 }}>
                In room: you + {players.length} other{players.length === 1 ? '' : 's'}
              </div>
              {players.map((p) => (
                <div key={p.id} style={{ opacity: 0.7 }}>• {p.name}</div>
              ))}
            </>
          ) : (
            <>
              <button style={btnStyle} disabled={busy} onClick={handleCreate}>
                Create room
              </button>
              <div style={{ margin: '8px 0', opacity: 0.6 }}>or join</div>
              <input
                value={joinCode}
                placeholder="ABC123"
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                style={inputStyle}
              />
              <button style={btnStyle} disabled={busy} onClick={handleJoin}>
                Join room
              </button>
            </>
          )}
          {err && <div style={{ color: '#fca5a5', marginTop: 6 }}>{err}</div>}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: '#18181b',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4,
  padding: '4px 6px',
  marginTop: 4,
  fontSize: 13,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
const btnStyle: React.CSSProperties = {
  width: '100%',
  marginTop: 6,
  background: '#3b82f6',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  padding: '6px 10px',
  cursor: 'pointer',
  fontSize: 13,
}
