# Clawd Strike

A Counter-Strike-flavoured **team deathmatch** FPS that runs in your browser. Both teams are
made of **Clawd**, the little orange Claude mascot, and they fight it out in **Little Clawdington**,
a small British town with one- and two-storey houses.

Everything (map, textures, models, sounds) is generated in code. There are no asset files, so the
whole game builds into a single HTML file.

## Features

**Gameplay**
- 5v5 team deathmatch by default (1v1 up to 8v8), with a score limit, time limit, respawns and spawn protection
- Bots with four difficulty levels (Recruit, Regular, Veteran, Elite). You can set enemy and teammate
  difficulty separately, and change either one mid-match from the pause menu
- Movement: sprint, crouch, slide (sprint + crouch), crouch-jump, quiet walk, and lean/peek with Q/E
- Aiming: aim down sights with right-click, a real scope on the sniper and a SUSAT optic on the L85
- CS-style shooting: first-shot accuracy, spread when moving or jumping, spray patterns you pull down
  against, damage falloff, and head, body and leg damage multipliers
- Wall penetration: wooden fences, sheds and doors can be shot through; brick and stone stop bullets.
  Every window is breakable glass
- Health bar plus ways to heal: two medkits per life (H or 4) and first-aid boxes around town that
  respawn. Ammo crates refill your ammo and grenades. Health regen can be switched on as a match option
- Frag grenades that bounce off walls, smash windows and knock players back

**Weapons**

| Primary | | Pistol / melee | |
|---|---|---|---|
| AK-47 | one-tap headshots, heavy recoil | Hi-Power | 13-round service pistol |
| L85A2 | British bullpup with an optic, easy to control | Webley Revolver | 6 big rounds |
| MP5 | fast SMG, accurate on the move | Knife | backstabs one-shot |
| Pump Shotgun | 9 pellets, loads shell by shell | | |
| L96 Sniper | British bolt-action, one-shot body kills | | |

**The town:** a high street with a pub (The Red Lion), a chippy (The Codfather), a pharmacy,
post office, bakery, newsagent, café and barber. There are terraced and semi-detached houses
with working stairs and upstairs rooms, back gardens with sheds and fences, ginnels (narrow
alleys) and back lanes, St Mary's church and graveyard, allotments with greenhouses, a village
green with a bandstand and war memorial, a playground and village hall, and bungalows. Street
props include red phone boxes, pillar boxes, Belisha beacons on a zebra crossing, double yellow
lines and cars with yellow number plates.

**UI:** rotating radar with callouts for your current location, a kill feed, the Tab scoreboard,
hit markers, damage-direction arcs, grenade warnings, a dynamic crosshair you can customise,
rebindable keys, sensitivity, FOV, graphics and audio settings, a loadout screen and a death cam.

## Running it

You need [Node.js](https://nodejs.org) 20.19 or newer.

### Fedora

```bash
sudo dnf install nodejs        # if you don't have it already
git clone https://github.com/lexsclav07/claude-shooter.git
cd claude-shooter
npm install
npm run dev                    # opens http://localhost:5173
```

### Windows 11

Install Node.js LTS (from nodejs.org, or `winget install OpenJS.NodeJS.LTS` in a terminal). Then:

```powershell
git clone https://github.com/lexsclav07/claude-shooter.git
cd claude-shooter
npm install
npm run dev
```

### Single-file build (no Node needed to play)

```bash
npm run build
```

This writes `dist/index.html`, one self-contained file of about 750 KB. Double-click it in any
modern browser or copy it to a USB stick. It works without a web server, so it's handy on a uni PC
where you can't install anything.

Chrome, Edge and Firefox all work. Use a desktop browser: the game needs pointer lock and a keyboard.

## Controls

| Action | Default |
|---|---|
| Move | W A S D |
| Jump | Space (crouch in mid-air to jump higher) |
| Sprint / walk quietly | Left Shift / Z |
| Crouch, or slide while sprinting | C |
| Lean / peek | Q / E |
| Fire / aim down sights | Left / right mouse |
| Reload / inspect | R / F |
| Primary / pistol / knife | 1 / 2 / 3, mouse wheel, X for last weapon |
| Grenade | G or 5 |
| Medkit | H or 4 |
| Scoreboard / loadout / pause | Tab / B / Esc |

You can rebind all of these in **Settings → Keys**. If you'd like crouch on Ctrl like CS, turn on
"Go fullscreen when a match starts" in Settings → Video. Outside fullscreen, Ctrl+W closes the tab.

## Tinkering guide

| File | What's in it |
|---|---|
| `src/config.js` | **Bot difficulty presets** (reaction time, aim error, turn speed, spray control, strafing and more), movement physics, team names and colours, match defaults |
| `src/weapons/defs.js` | Every gun's damage, fire rate, magazine, spread, recoil, penetration and zoom. Add an entry here and to `PRIMARIES` to get a new gun |
| `src/weapons/models.js` | The box-built gun models |
| `src/world/map.js` | Town layout. The north half is defined once and the south half is the same plan rotated 180° with different buildings, which keeps the map fair |
| `src/world/buildings.js` | Building generator: walls with door/window openings, floors, stairs, roofs, plus templates for terraces, shops, the pub, bungalows and the church |
| `src/world/props.js` | Phone boxes, cars, fences, hedges, trees, headstones and other props |
| `src/actors/bot.js` | Bot brain: sight cone and line of sight, hearing, aim model, and engage, hunt, roam, retreat and heal behaviour |
| `src/nav.js` | Navigation graph, built automatically from the collision boxes, plus A* |
| `src/actors/mascot.js` | The Clawd model and hitboxes |
| `src/fx/audio.js` | All sound effects, synthesised with WebAudio |

The nav graph is generated from the level geometry. If you add a building with doors and stairs
through `building()` in `buildings.js`, bots will path through it automatically.

### Debugging

- Open the browser console. `__game` is the running game object
- `?test` in the URL skips pointer lock, for automated testing
- `__game.autoplay('hard')` hands your player to a bot; `__game.simulate(60)` fast-forwards a minute
  without rendering

## Credits

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev). Clawd is Claude's mascot.
All art and audio in this repo is procedural.
