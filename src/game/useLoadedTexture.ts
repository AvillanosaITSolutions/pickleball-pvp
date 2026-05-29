import { useEffect, useState } from 'react'
import * as THREE from 'three'

export function useLoadedTexture(url: string | null): THREE.Texture | null {
  const [tex, setTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    console.log('[useLoadedTexture] url changed:', url)
    setTex((prev) => {
      if (!url) {
        prev?.dispose()
        return null
      }
      return prev
    })

    if (!url) return

    let active = true
    const loader = new THREE.TextureLoader()

    const onLoad = (texture: THREE.Texture) => {
      if (!active) return
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      texture.needsUpdate = true
      const img = texture.image as { width?: number; height?: number } | undefined
      console.log('[useLoadedTexture] LOADED:', url, {
        width: img?.width,
        height: img?.height,
      })
      setTex((prev) => {
        prev?.dispose()
        return texture
      })
    }

    const onError = (err: unknown) => {
      if (!active) return
      console.error('[useLoadedTexture] TEXTURE LOAD FAILED:', url, err)
      setTex((prev) => {
        prev?.dispose()
        return null
      })
    }

    loader.load(url, onLoad, undefined, onError)

    return () => {
      active = false
    }
  }, [url])

  return tex
}
