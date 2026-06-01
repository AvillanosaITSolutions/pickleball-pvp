import { useEffect, useState } from 'react'
import { Game } from './game/Game'
import { SabongGame } from './game/SabongGame'
import { AuthGate } from './game/AuthGate'
import { Lobby, clearInviteUrl } from './game/Lobby'
import { useMultiplayer } from './game/multiplayer'
import { initCrazyGames, crazyLoadingDone, crazyGameplayStart, crazyGameplayStop, onCrazyMuteChange, crazyUpdateRoom, crazyLeaveRoom, onCrazyJoinRoom } from './game/crazygames'
import { joinRoom } from './game/net'
import { setMuted } from './game/sfx'
import './App.css'

// Build-time game selector. Set VITE_GAME=rage or VITE_GAME=sabong to ship
// a single-game bundle (used for CrazyGames submissions). Unset = combined lobby.
const BUILD_GAME = (import.meta.env.VITE_GAME as 'rage' | 'sabong' | undefined) ?? 'all'

function App() {
  const [inGame, setInGame] = useState(false)
  const mode = useMultiplayer((s) => s.mode)
  const code = useMultiplayer((s) => s.code)
  const myName = useMultiplayer((s) => s.myName)
  const setMode = useMultiplayer((s) => s.setMode)
  const exit = () => { setInGame(false); clearInviteUrl(); crazyGameplayStop() }

  useEffect(() => { initCrazyGames().then(crazyLoadingDone) }, [])

  // CrazyGames has a site-wide mute toggle. Reflect it in our audio state so
  // players don't have to mute twice. Their UI is the source of truth here.
  useEffect(() => onCrazyMuteChange((m) => setMuted(m)), [])
  useEffect(() => {
    if (inGame) crazyGameplayStart()
    else crazyGameplayStop()
  }, [inGame])

  // Tell CrazyGames which Colyseus room we're in. They use this to power
  // platform-level "join friend" flows and to populate the in-portal room
  // banner. Clear it when we leave so they don't show a stale invite.
  useEffect(() => {
    if (code) crazyUpdateRoom(code, mode, true)
    else crazyLeaveRoom()
  }, [code, mode])

  // CG can push us into a room (e.g. friend joined the CrazyGames party while
  // we were idle). When that happens, fire the same join flow the lobby uses.
  useEffect(() => onCrazyJoinRoom(async ({ roomId, mode: m }) => {
    if (useMultiplayer.getState().code === roomId) return
    if (m) setMode(m)
    const name = myName.trim() || `Player${Math.floor(Math.random() * 1000)}`
    const res = await joinRoom(roomId, name, m || useMultiplayer.getState().mode)
    if (res.ok) setInGame(true)
  }), [setMode, myName])

  // Single-game builds force the corresponding mode so the lobby's network
  // calls (quickplay/create/join) all target the right Colyseus room.
  useEffect(() => {
    if (BUILD_GAME !== 'all' && mode !== BUILD_GAME) setMode(BUILD_GAME)
  }, [mode, setMode])

  useEffect(() => {
    const title =
      BUILD_GAME === 'rage' ? 'Rage Room — destroy stuff online'
      : BUILD_GAME === 'sabong' ? 'Cluck Fighters — chicken battle royale'
      : 'rageroom'
    document.title = title
  }, [])

  const activeGame = BUILD_GAME === 'all' ? mode : BUILD_GAME
  return (
    <AuthGate>
      {inGame
        ? (activeGame === 'sabong' ? <SabongGame onExit={exit} /> : <Game />)
        : <Lobby onEnter={() => setInGame(true)} />}
    </AuthGate>
  )
}

export default App
