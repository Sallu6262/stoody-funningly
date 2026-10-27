# Third-party notices

This project intentionally credits the foundations it reuses. Salman & Wajeha is the identity of this adaptation, not a claim of authorship over the referenced open-source work.

## Folio 2019

The vehicle behavior and overall low-poly driving principles were adapted from Bruno Simon's Folio 2019:

- Source: https://github.com/brunosimon/folio-2019
- License: MIT
- Copyright (c) 2019 Bruno SIMON

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Folio 2025 controls and audio

The touch joystick's car-relative steering, cubic throttle response, 270-degree forward sector, inner/outer radii, and ring shader are adapted from `sources/Game/Inputs/Nipple.js` and `sources/Game/Player.js` in Bruno Simon's Folio 2025, commit `41046b57eeed8d156d9c3fd7fa259900baef7816`. The implementation is ported to this project's Z-up Three.js/Cannon world without adding the reference site's renderer, physics stack, GSAP, or Howler dependencies.

The small engine, road, collision, and click recordings in `public/audio/` come from the same repository's `static/sounds/` directory. See `public/audio/README.md` for the original paths.

- Source: https://github.com/brunosimon/folio-2025/tree/41046b57eeed8d156d9c3fd7fa259900baef7816
- License: MIT
- Copyright (c) 2025 Bruno Simon

MIT License

Copyright (c) 2025 Bruno Simon

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

### Kounine — Sudo

The background music `public/audio/sudo.mp3` is **Sudo** by Kounine, created for Bruno Simon's portfolio. The music has its own explicit CC0 1.0 Universal dedication in `static/sounds/musics/license.md`, included unchanged as `public/audio/MUSIC-LICENSE.md`.

- Artist credit: https://bruno-simon.com/ (Behind the scene → Musics)
- Track: https://github.com/brunosimon/folio-2025/blob/41046b57eeed8d156d9c3fd7fa259900baef7816/static/sounds/musics/Sudo.mp3
- License: https://creativecommons.org/publicdomain/zero/1.0/

## Airsup Lab procedural F1 geometry

The compact lofting approach in `src/game/F1Model.js` is adapted from the procedural F1 implementation in AirsupHQ/airsup-lab at commit `e21864bda5a614ffae8d0a835518be8e2e571dce`. The high-detail original was not bundled; only a simplified low-poly lofting technique was adapted.

- Source: https://github.com/AirsupHQ/airsup-lab
- License: MIT
- Copyright (c) 2026 The lab authors

MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Quaternius Modular Train Pack

The locomotive used by the countdown/timeout animation in `public/assets/locomotive.glb` is `Locomotive Front` from Quaternius' Modular Train Pack. It is distributed under Creative Commons Zero v1.0 Universal (CC0-1.0). Attribution is not required by CC0, but is included here to preserve clear provenance.

- Creator: Quaternius
- Official pack: https://quaternius.com/packs/modulartrain.html
- Model mirror used for the GLB: https://poly.pizza/m/WY84FHug9s
- License: https://creativecommons.org/publicdomain/zero/1.0/

## Runtime libraries

- Three.js 0.164.1 — MIT License, Copyright © 2010-2024 three.js authors
- Cannon.js 0.6.2 — MIT License, Copyright © 2012-2016 Stefan Hedman and cannon.js authors
- Vite 5.4.11 (build tooling only) — MIT License, Copyright © 2019-present Evan You and Vite contributors
