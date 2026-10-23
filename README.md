# Clawd Strike

A Counter-Strike-flavoured **team deathmatch** FPS that runs in your browser, with tanks and
jets. Both teams are made of **Clawd**, the little orange Claude mascot. They fight it out in
**Little Clawdington**, a small British town with one- and two-storey houses, and across the
farms, woods and country lanes around it.

Everything (map, textures, models, sounds) is generated in code. There are no asset files, so the
whole game builds into a single HTML file.

## Features

**Gameplay**
- 8v8 team deathmatch by default (1v1 up to 12v12), with a score limit, time limit, respawns and
  spawn protection
- Pick a **class every time you die** on the deploy screen. Infantry classes are Rifleman, Engineer,
  Recon and Medic. **Tank Commander** spawns you in a Challenger 2 and **Pilot** in a Typhoon,
  if your team has one free
- Bots with four difficulty levels (Recruit, Regular, Veteran, Elite). You can set enemy and teammate
  difficulty separately, and change either one mid-match from the pause menu. Bots pick classes,
  drive tanks, fly jets, fire NLAWs at tanks, throw C4 and smoke, and get out of the way of tanks
- Movement: sprint, crouch, slide (sprint + crouch), crouch-jump, quiet walk, and lean/peek with Q/E
- Aiming: aim down sights with right-click, a real scope on the sniper and a SUSAT optic on the L85
- CS-style shooting: first-shot accuracy, spread when moving or jumping, spray patterns you pull down
  against, damage falloff, and head, body and leg damage multipliers
- Wall penetration: wooden fences, sheds and doors can be shot through; brick and stone stop bullets.
  Every window is breakable glass
- Health bar plus ways to heal: medkits (H) and first-aid boxes around the map that respawn. Ammo
  crates refill your ammo, gadgets and frags. Health regen can be switched on as a match option
- **Destruction:** fences, hedges, sheds, phone boxes, bus shelters, cars, lamp posts and more can be
  blown up or flattened by tanks. Fuel drums and petrol pumps explode when shot. Everything is
  rebuilt for the next match

**Classes**

| Class | Kit |
|---|---|
| Rifleman | AK-47 or L85A2, 2 frags, 1 smoke, 2 medkits |
| Engineer | MP5 or shotgun, **NLAW** anti-tank launcher, **AT mines**, 1 frag, 1 medkit |
| Recon | L96 sniper, remote **C4**, 1 frag, 1 smoke, 1 medkit |
| Medic | L85A2, MP5 or shotgun, 3 smokes, 5 medkits |
| Tank Commander | Challenger 2: 120 mm cannon, coaxial MG, gunner sight |
| Pilot | Typhoon: 27 mm cannon, rockets, free-fall bombs |

Everyone also gets a pistol (Hi-Power or Webley) and a knife. Each team gets 1 tank and 1 jet
(2 tanks from 8v8, 2 jets from 11v11). Vehicles can be switched off in match setup.

**Explosives:** frag grenades, smoke grenades (they block everyone's view, bots included), NLAW
rockets (rear hits on tanks do 45% more), sticky C4 you detonate with right-click, AT mines that
only go off under enemy tanks, tank shells, jet rockets and bombs.

**Weapons**

| Primary | | Pistol / melee | |
|---|---|---|---|
| AK-47 | one-tap headshots, heavy recoil | Hi-Power | 13-round service pistol |
| L85A2 | British bullpup with an optic, easy to control | Webley Revolver | 6 big rounds |
| MP5 | fast SMG, accurate on the move | Knife | backstabs one-shot |
| Pump Shotgun | 9 pellets, loads shell by shell | | |
| L96 Sniper | British bolt-action, one-shot body kills | | |

**The map:** the town is a high street with a pub (The Red Lion), a chippy (The Codfather), a
pharmacy, post office, bakery, newsagent, café and barber. There are terraced and semi-detached
houses with working stairs and upstairs rooms, back gardens with sheds and fences, ginnels and back
lanes, St Mary's church, allotments, a village green with a bandstand, a playground and bungalows.
Around it is open countryside roughly 400 m × 300 m that tanks can drive through. It has two farms with
barns and hay bales, woods, fields and hedgerows, a petrol station, a country pub, cottages, a WW2
pillbox, a ring road, and a military depot for each team where its vehicles spawn. Both halves of
the map are the same plan rotated 180° so neither team has an advantage.

**UI:** deploy / class screen, rotating radar (it zooms out in vehicles) with callouts for your
current location, a kill feed, the Tab scoreboard, hit markers, damage-direction arcs, grenade
warnings, vehicle HUDs (turret direction, reload, speed, altitude, throttle, bomb pipper, stall /
pull-up warnings), a dynamic crosshair you can customise, rebindable keys, sensitivity, FOV,
graphics and audio settings, and a death cam.

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

This writes `dist/index.html`, one self-contained file of about 900 KB. Double-click it in any
modern browser or copy it to a USB stick. It works without a web server, so it's handy on a uni PC
where you can't install anything.

Chrome, Edge and Firefox all work. Use a desktop browser: the game needs pointer lock and a keyboard.

## Controls

**On foot**

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
| Class gadgets (NLAW, C4, AT mine) | 4 / 5 |
| Frag / smoke grenade | G / T |
| Medkit | H |
| Detonate C4 | Right mouse while holding C4 |
| Scoreboard / class & loadout / pause | Tab / B / Esc |

**Tank**

| Action | Default |
|---|---|
| Drive / turn the hull | W S / A D |
| Aim the turret | Mouse |
| Fire | Left mouse (1 = cannon, 2 = coax MG, or hold Space for the MG) |
| Gunner sight | Right mouse |

**Jet**

| Action | Default |
|---|---|
| Steer | Mouse: point where you want to go and the jet banks and pulls to follow |
| Throttle / afterburner | W S / Left Shift |
| Roll / rudder | A D / Q E |
| Cannon | Left mouse |
| Rockets or bombs | Right mouse (1 = rockets, 2 = bombs) |

Bombs land on the diamond pipper. If you fly too far out, the autopilot turns you back. Rockets and
bombs slowly rearm while you're not firing them.

You can rebind all of these in **Settings → Keys**. If you'd like crouch on Ctrl like CS, turn on
"Go fullscreen when a match starts" in Settings → Video. Outside fullscreen, Ctrl+W closes the tab.

## Tinkering guide

| File | What's in it |
|---|---|
| `src/config.js` | **Bot difficulty presets** (reaction time, aim error, turn speed, spray control, strafing and more), movement physics, team names and colours, match defaults |
| `src/classes.js` | The classes, what they carry and the per-team vehicle limits |
| `src/weapons/defs.js` | Every gun's damage, fire rate, magazine, spread, recoil, penetration and zoom, plus the gadgets and vehicle guns |
| `src/combat.js` | Bullets, explosions, smoke, and the `PROJECTILES` table (blast radius and damage for grenades, rockets, shells, bombs, C4 and mines) |
| `src/vehicles/tank.js`, `jet.js` | Vehicle handling (`TANK` / `JET` tuning at the top), weapons and cameras |
| `src/vehicles/ai.js` | Tank and jet bots, and the grid tanks path-find on |
| `src/vehicles/models.js` | The Challenger 2 and Typhoon models |
| `src/world/map.js` | Town layout, spawns and vehicle spawns |
| `src/world/countryside.js` | Farms, woods, fields, the petrol station, depots and the map edge |
| `src/world/buildings.js` | Building generator: walls with door/window openings, floors, stairs, roofs, plus templates for terraces, shops, the pub, bungalows and the church |
| `src/world/props.js` | Phone boxes, cars, fences, hedges, trees and other props, and how much damage each one takes |
| `src/world/destruction.js` | Smashing props, wrecks, chain explosions and rebuilding for the next match |
| `src/actors/bot.js` | Infantry bot brain: sight cone and line of sight, hearing, aim model, and engage, hunt, roam, retreat and heal behaviour |
| `src/nav.js` | Navigation graph, built automatically from the collision boxes, plus A* |
| `src/actors/mascot.js` | The Clawd model and hitboxes |
| `src/fx/audio.js` | All sound effects and engine loops, synthesised with WebAudio |

The nav graph is generated from the level geometry. If you add a building with doors and stairs
through `building()` in `buildings.js`, bots will path through it automatically. Props built inside
`B.destructible({...}, () => {...})` become breakable.

### Debugging

- Open the browser console. `__game` is the running game object
- `?test` in the URL skips pointer lock, for automated testing
- `__game.autoplay('hard')` hands your player to a bot; `__game.simulate(60)` fast-forwards a minute
  without rendering

## Credits

Built with [three.js](https://threejs.org) and [Vite](https://vite.dev). Clawd is Claude's mascot.
All art and audio in this repo is procedural.
