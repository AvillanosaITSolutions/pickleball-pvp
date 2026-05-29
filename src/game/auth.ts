// Lightweight bridge from imperative call-sites to the Auth0 React hook.
// AuthGate calls bindAuth() so non-React modules (net.ts, store fetches)
// can grab a fresh access token without prop-drilling.

type GetTokenFn = () => Promise<string | null>

let getter: GetTokenFn = async () => null

export function bindGetAccessToken(fn: GetTokenFn) {
  getter = fn
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await getter()
  } catch {
    return null
  }
}
