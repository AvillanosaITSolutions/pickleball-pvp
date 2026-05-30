# Audio files

Drop files into this folder with the **exact** names below. Missing files
fail silently — the game keeps working with whatever subset you've added.

Format: mp3 preferred (broad browser support), ogg/wav also fine if you
rename to .mp3 isn't possible (then update the path in `sfx.ts` /
`store.ts`). Keep clips short (50–500 ms for SFX, looping 30–90 s for
music) and normalised; per-event volumes already average ~50%.

---

## Already in the repo

```
thud.mp3         — generic projectile impact (per-kind fallback)
gunshot.mp3      — pistol fire
glass-break.mp3  — TV / glass smash
stretch.mp3      — bowstring stretch while charging a throw
peck.mp3         — beak swing (Sabong)
```

---

## Wall of Anger (Rage Room) — new

```
music-rage.mp3        — looping background music (industrial / metal works well)
whoosh.mp3            — throw release
hit-dummy.mp3         — body impact layer on top of the per-kind thud
combo-up.mp3          — combo milestone reached (3, 6, 12, 20, 35, 50)
rage-max.mp3          — rage meter filled to 100 %
session-start.mp3     — 60-second timer begins (air horn / bell)
session-end.mp3       — 60-second timer ends (buzzer)
```

## Sabong (1 v 1) — new

```
music-sabong.mp3            — looping fight music
music-sabong-waiting.mp3    — looping waiting-for-opponent music (quieter)
music-sabong-victory.mp3    — looping victory-screen music
peck-hit.mp3                — melee connect (flesh / feather impact)
shoot.mp3                   — ranged shot fired (slingshot / lightning)
shot-hit.mp3                — ranged shot connected
jump.mp3                    — flap / jump
pickup.mp3                  — item pickup chime
hurt.mp3                    — local bird took damage
death.mp3                   — local bird defeated
victory.mp3                 — local bird won (short stinger)
item-spawn.mp3              — item dropped on the arena floor
```

## Shared UI

```
ui-click.mp3      — generic button click (optional — currently unused, reserved)
```

---

## Suggested free sources

- [freesound.org](https://freesound.org) — CC0 / attribution clips; search
  e.g. "whoosh", "impact body", "cockfight" (yes, real), "8-bit victory".
- [pixabay.com/sound-effects](https://pixabay.com/sound-effects/) — royalty-free,
  no attribution required. Good for chimes / UI / short music loops.
- [opengameart.org](https://opengameart.org) — looping game music in many genres;
  filter by license = CC0 or CC-BY.
- [zapsplat.com](https://zapsplat.com) — free with account; large library of
  impacts, whooshes, and UI sounds.

## Tips

- Music tracks should loop cleanly — trim to a beat boundary or use a tool
  like Audacity's "Find Zero Crossings".
- One-shots benefit from ~10 ms fade-in / fade-out to avoid clicks.
- Match perceived loudness across files (target -14 LUFS for music,
  -8 to -10 LUFS for SFX) so the mix doesn't need per-clip volume tuning.
- Filenames are case-sensitive on the web — `Peck-Hit.mp3` ≠ `peck-hit.mp3`.
