// Capture gameplay assets for the CrazyGames submission.
//
// Loads the deployed game, spawns 9 Hard bots in a private room, then captures:
//   * Cover images (1920x1080, 800x1200, 800x800) at the 6s mark when bots have
//     converged on the center and started swinging.
//   * Preview videos (landscape 16:9, portrait 9:16), ~18s each starting from
//     the moment the match enters the fighting phase.
//
// Real gameplay frames — no AI art, no stock images. Bots run themselves so the
// scene is full of action without any human input.
//
// Run:
//   npm install --no-save playwright
//   npx playwright install chromium   # one-time, downloads the browser
//   node tools/capture-assets.mjs
//
// Override the target with GAME_URL=... if you want to capture a different env.
//
// Output lands in ./assets/. Videos come out as .webm — convert to .mp4 with:
//   ffmpeg -i assets/preview-landscape.webm -c:v libx264 -crf 23 -preset fast assets/preview-landscape.mp4

import { chromium } from 'playwright'
import { mkdir, rename, readdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const URL = process.env.GAME_URL || 'https://chicken.88-222-245-88.nip.io'
const OUT = 'assets'

// All gameplay captures use the same scene: 9 Hard bots in a private room. The
// human session sits still — the bots will close on them quickly, then start
// fighting each other. The chaos that produces is what the cover sells.
const SHOTS = [
  { name: 'cover-landscape', w: 1920, h: 1080, kind: 'image' },
  { name: 'cover-portrait',  w: 800,  h: 1200, kind: 'image' },
  { name: 'cover-square',    w: 800,  h: 800,  kind: 'image' },
  { name: 'preview-landscape', w: 1920, h: 1080, kind: 'video', durationMs: 18000 },
  { name: 'preview-portrait',  w: 720,  h: 1280, kind: 'video', durationMs: 18000 },
]

async function setupRoom(page) {
  // Wait for the lobby card.
  await page.waitForSelector('text=PICK YOUR FIGHT', { timeout: 15000 })

  // Set the bot count slider to 9. React inputs need the native value-setter
  // so the change event triggers the onChange handler properly.
  await page.evaluate(() => {
    const slider = document.querySelector('input[type="range"][aria-label="Bot count"]')
    if (!slider) throw new Error('bot count slider not found')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(slider, '9')
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })

  // Click Hard (the difficulty buttons are plain text).
  await page.click('button:has-text("hard")')

  // Create the private room. The auto-quickplay / mode picker doesn't fire here
  // because we're on the standalone Cluck Fighters build.
  await page.click('button:has-text("Create private room")')

  // Wait for the canvas to mount (means we've left the lobby).
  await page.waitForSelector('canvas', { timeout: 10000 })

  // Server has a 5s start countdown after the room reaches >=2 birds. With 9
  // bots pre-spawned that fires immediately on room create, so by ~5.5s we're
  // in the fighting phase. Add another second for the bots to break formation.
  await page.waitForTimeout(6500)
}

async function captureImage(shot) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: shot.w, height: shot.h } })
  const page = await ctx.newPage()
  try {
    // ?capture=1 makes SabongGame hide the HUD and force first-person, so the
    // shot is pure arena + enemy chickens. CG rejects covers with UI overlays
    // and our own bird's back-of-head dominating the frame is dead weight.
    await page.goto(`${URL}/?capture=1`, { waitUntil: 'domcontentloaded' })
    await setupRoom(page)
    const path = join(OUT, `${shot.name}.png`)
    await page.screenshot({ path, type: 'png' })
    console.log(`✓ ${path}`)
  } finally {
    await ctx.close()
    await browser.close()
  }
}

async function captureVideo(shot) {
  const tmpDir = join(OUT, '_raw')
  await mkdir(tmpDir, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    viewport: { width: shot.w, height: shot.h },
    recordVideo: { dir: tmpDir, size: { width: shot.w, height: shot.h } },
  })
  const page = await ctx.newPage()
  let videoPath
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await setupRoom(page)
    await page.waitForTimeout(shot.durationMs)
    videoPath = await page.video().path()
  } finally {
    await ctx.close()
    await browser.close()
  }
  if (videoPath && existsSync(videoPath)) {
    const out = join(OUT, `${shot.name}.webm`)
    await rename(videoPath, out)
    console.log(`✓ ${out}`)
  }
  // Clean up any leftover raw dirs.
  for (const f of await readdir(tmpDir).catch(() => [])) {
    await rm(join(tmpDir, f), { recursive: true, force: true })
  }
}

async function main() {
  await mkdir(OUT, { recursive: true })
  console.log(`Capturing from ${URL}`)
  for (const shot of SHOTS) {
    console.log(`→ ${shot.name} (${shot.w}x${shot.h}, ${shot.kind})`)
    if (shot.kind === 'image') await captureImage(shot)
    else await captureVideo(shot)
  }
  console.log('\nDone. Convert .webm → .mp4 if your upload form rejects webm:')
  console.log('  ffmpeg -i assets/preview-landscape.webm -c:v libx264 -crf 23 -preset fast assets/preview-landscape.mp4')
}

main().catch((e) => { console.error(e); process.exit(1) })
