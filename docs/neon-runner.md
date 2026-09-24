# Veylumen

Current playable game from the ChatGPT development session.

Live: https://neon-runner-yddnsl.v2.appdeploy.ai/

Open index.html directly in a modern browser. The file contains the complete game, compiled styles and pixel art. No runtime CDN, account or backend is required. Tap the playfield, Space or ArrowUp to jump, up to four times before landing.

Includes nine characters and matching obstacles, including a helicopter and ground turret, shaped collision detection, a 1.25 second death explosion, attacking samurai, coin and magnet pickups, temporary protective weapons, and the fighter's animated fire kindschal. Fighter jump particles are silver white. The held and orbiting daggers have additional body clearance.

The deployment uses the existing AppDeploy html-static project and replaces index.html and tests/tests.json only. GitHub stores the same HTML at public/neon-runner.html. Historical paths and the deployment URL stay the same for compatibility, while the visible game title is Veylumen. This is a source snapshot, not automatic GitHub deployment integration.

Validation: Chromium mobile touch controls, square canvas scaling, fire animation, weapon pickup/protection, jump sparks, restart and delayed game over were tested before export. Deployment tests are in tests/tests.json.

Graphics settings: Maximal is the default, with Normal and Schwach selectable from Menü at the top left before play or after Game Over. The menu is hidden while playing. The chosen setting is remembered locally. All modes render at the same 60 FPS target during play. Mobile pixel budgets cap raster load; lower modes reduce glow, particles and trail length. Sustained slow frames automatically reduce visual cost in Maximal and the tab stops simulating while hidden. Maximal draws stars and a gradient without background blocks. Browser APIs do not expose device temperature, so thermal safety cannot be guaranteed; use Schwach if the phone feels warm.

Obstacle progression: low spikes and hovering hazards enter after a short warmup. Later rounds combine hazards in pairs with 240 pixels of horizontal spacing. Each of the nine character themes retains its own main enemy. Spawn groups become denser over time while world speed stays capped at 9.5 pixels per simulation step. The shape based collision system covers all new hazards. The browser test checks 19 escape patterns at maximum speed.

Each character now has a separate dark world palette, including sky, grid, ground and distant lights. Spikes and hovering hazards share the character color family, while water and ice keep their material colors with a matching glowing rim. The scene colors also apply in the reduced graphics modes.

Publication preparation: Prisma is a turquoise geometric machine core. Schattenkern is an indigo mineral capsule. Their world palettes, hazards, orbiting weapons, pickups and destruction fragments use matching new colors. The previous hair, clothing, skeletal face, robe, scythe and staff have been removed from these characters. Veylumen is a provisional working name. Official store and trademark searches are still needed before publication. The standalone game includes compiled Tailwind CSS 3.4.17. Its complete MIT notice and copyright appear in the menu. If code from the larger repository enters a future iPhone app, preserve the licenses applicable to that code. Any future app icon, screenshots and store description should use only the new name and designs.

Running animation: the ground characters pump arms and alternate their feet while their body bounces; jumping tucks the feet into an airborne pose. Heli bobs in flight. The trail flows behind the runner and small roadway marks scroll beneath the character. All movement is drawn relative to the original collision box, so obstacle timing and touch input are unchanged. This remains visible in Schwach without adding large particle systems.
