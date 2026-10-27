# Audio provenance

All files were downloaded from the pinned Folio 2025 revision below and verified against GitHub's Git blob SHA-1 hashes.

Source root: https://github.com/brunosimon/folio-2025/tree/41046b57eeed8d156d9c3fd7fa259900baef7816

| Local asset | Original path under `static/sounds/` | Bytes |
|---|---|---:|
| `engine.mp3` | `vehicle/engine/muscle car engine loop idle.mp3` | 56,933 |
| `road.mp3` | `vehicle/floor/Source Stone Loop Small Rubbing Pebbles On Concrete 02.mp3` | 102,986 |
| `hit-stone-1.mp3` | `hits/defaults/25707 stone hit on ground 5-full.mp3` | 6,251 |
| `hit-stone-2.mp3` | `hits/defaults/Short Stone Hit 01.mp3` | 4,154 |
| `hit-metal.mp3` | `hits/metal/Metalic 3.mp3` | 3,725 |
| `click.mp3` | `clicks/Source Metal Clicks Delicate Light Sharp Clip Mid 07.mp3` | 2,969 |
| `sudo.mp3` | `musics/Sudo.mp3` | 6,173,760 |
| `MUSIC-LICENSE.md` | `musics/license.md` | 7,047 |

The source code and small sound assets are distributed with the repository's MIT license (Copyright (c) 2025 Bruno Simon), reproduced in `THIRD_PARTY_NOTICES.md` at the project root. **Sudo** is by Kounine, with the separate CC0 dedication in `MUSIC-LICENSE.md`.

Music streams through an HTML audio element after the player's first start gesture. Only the small effects are decoded into Web Audio buffers. No audio requests occur on the welcome screen. Skid, boost, hop, horn, train warning, and result tones are synthesized by `SoundManager.js`.
