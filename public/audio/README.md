# Audio files

Drop one mp3 (or ogg/wav) per projectile kind here, named exactly:

```
tomato.mp3
egg.mp3
banana.mp3
cake.mp3
shit.mp3
paint.mp3
water.mp3
rock.mp3
brick.mp3
bowlingBall.mp3
chair.mp3
tv.mp3
gun.mp3
```

The audio system (`src/game/audio.ts`) pre-loads each file into a small pool
so rapid throws / auto-fire don't cut each other off.

Keep clips short (50–500 ms) and normalised; the player volumes at ~60%.
Missing files fail silently — no console spam.
