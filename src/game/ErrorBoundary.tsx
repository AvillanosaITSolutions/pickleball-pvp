import { Component, type ReactNode, type ErrorInfo } from 'react'

/**
 * Silent error boundary — catches any render-time error in its subtree and
 * renders `fallback` (default: nothing) instead of letting the error bubble
 * up and unmount the entire app.
 *
 * Logs the error to console so debugging is still possible, but never blocks
 * the rest of the UI.
 *
 * Used in two places:
 *   1. Around each scene subsystem in Game.tsx (Props, Wall, Dummy, etc.)
 *      so one broken prop can't black out the whole 3D scene.
 *   2. Around the HUD so a broken HUD widget doesn't take down the game.
 *
 * NOTE: React error boundaries only catch errors thrown during render.
 * Errors inside `useFrame` callbacks don't reach this — see the global
 * error suppressor at the bottom of this file for those.
 */
interface State {
  hasError: boolean
}

interface Props {
  /** What to render when the subtree throws. Default: null (silent skip). */
  fallback?: ReactNode
  /** Optional label for console logs, e.g. "Props" or "Wall". */
  label?: string
  children: ReactNode
  /** If true, attempt to remount the subtree after `recoverMs` ms. */
  recoverable?: boolean
  recoverMs?: number
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }
  private recoverTimer: ReturnType<typeof setTimeout> | null = null

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(
      `[ErrorBoundary${this.props.label ? ' ' + this.props.label : ''}] caught`,
      error,
      info.componentStack,
    )
    if (this.props.recoverable) {
      const ms = this.props.recoverMs ?? 1500
      this.recoverTimer = setTimeout(() => {
        this.setState({ hasError: false })
      }, ms)
    }
  }

  componentWillUnmount() {
    if (this.recoverTimer) clearTimeout(this.recoverTimer)
  }

  render() {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}

/**
 * Install once at app startup. Swallows `error` and `unhandledrejection` events
 * that would otherwise bubble to the dev overlay and cover the screen.
 *
 * Only suppresses default behaviour; the errors are still logged to console
 * via console.warn so you can see what went wrong without losing the game.
 */
let installed = false
export function installGlobalErrorSuppressor() {
  if (installed) return
  installed = true

  window.addEventListener(
    'error',
    (e) => {
      console.warn('[global error suppressed]', e.error ?? e.message, e.filename, e.lineno)
      e.preventDefault()
    },
    { capture: true },
  )

  window.addEventListener(
    'unhandledrejection',
    (e) => {
      console.warn('[global rejection suppressed]', e.reason)
      e.preventDefault()
    },
    { capture: true },
  )
}
