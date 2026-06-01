# Asset capture

`capture-assets.mjs` produces the 3 cover images + 2 preview videos required by
the CrazyGames submission, using real gameplay frames (not AI art).

## What it does

1. Headless Chrome opens `https://chicken.88-222-245-88.nip.io`
2. Sets bot count to 9, difficulty to Hard
3. Clicks **Create private room**
4. Waits ~6.5s for the 5s start countdown + a moment of chaos
5. Screenshots / records at the required resolution

## Run it

```sh
npm install --no-save playwright
npx playwright install chromium
node tools/capture-assets.mjs
```

Output drops into `./assets/`:

| File | Use |
|---|---|
| `cover-landscape.png` (1920×1080) | CG Landscape 16:9 cover |
| `cover-portrait.png` (800×1200) | CG Portrait 2:3 cover |
| `cover-square.png` (800×800) | CG Square 1:1 cover |
| `preview-landscape.webm` (1920×1080, 18s) | CG Landscape preview video |
| `preview-portrait.webm` (720×1280, 18s) | CG Portrait preview video |

## Caveats

- The script needs the **latest deploy** (bot AI v2 + Create-room flow) live at
  the URL. Push your branch and wait for CI before running.
- CrazyGames accepts MP4/MOV for the video uploads — if their form rejects
  `.webm`, convert with ffmpeg:
  ```sh
  ffmpeg -i assets/preview-landscape.webm -c:v libx264 -crf 23 -preset fast assets/preview-landscape.mp4
  ffmpeg -i assets/preview-portrait.webm  -c:v libx264 -crf 23 -preset fast assets/preview-portrait.mp4
  ```
- Want different framing? Edit the `setupRoom` wait timing in the script — a
  longer wait shows fewer bots (already eliminated), a shorter wait catches the
  initial rush before bots scatter.

## Alternative — manual capture

If Playwright won't install, fall back to OBS / Windows Game Bar:

1. Open the game in Chrome, set the window to 1920×1080 (DevTools → device
   toolbar → responsive)
2. Create a private room with 9 Hard bots
3. After the fight starts, screenshot or record gameplay
4. Resize/crop the screenshots to 800×1200 and 800×800 in any image editor

A 15-second OBS recording at 1280×720 → upscaled / cropped works fine for
Basic Launch.
