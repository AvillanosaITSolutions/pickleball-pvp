import { useEffect, useState } from 'react'
import { Game } from './game/Game'
import { SabongGame } from './game/SabongGame'
import { AuthGate } from './game/AuthGate'
import { Lobby, clearInviteUrl } from './game/Lobby'
import { useMultiplayer } from './game/multiplayer'
import { initCrazyGames, crazyLoadingDone, crazyGameplayStart, crazyGameplayStop } from './game/crazygames'
import './App.css'

// Build-time game selector. Set VITE_GAME=rage or VITE_GAME=sabong to ship
// a single-game bundle (used for CrazyGames submissions). Unset = combined lobby.
const BUILD_GAME = (import.meta.env.VITE_GAME as 'rage' | 'sabong' | undefined) ?? 'all'

function App() {
  const [inGame, setInGame] = useState(false)
  const mode = useMultiplayer((s) => s.mode)
  const setMode = useMultiplayer((s) => s.setMode)
  const exit = () => { setInGame(false); clearInviteUrl(); crazyGameplayStop() }

  useEffect(() => { initCrazyGames().then(crazyLoadingDone) }, [])
  useEffect(() => {
    if (inGame) crazyGameplayStart()
    else crazyGameplayStop()
  }, [inGame])

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
