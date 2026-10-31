# PlayDrive

**English** · [Português](README.pt-BR.md)

Semi-truck parking simulator that runs 100 % in the browser. It is not an arcade game: the
combination has a diesel engine with a torque curve and an automated gearbox, tyres that saturate,
a fifth wheel that transmits push and pull, and a trailer that swings, drifts and jackknifes when
the driver insists. When in doubt between playable and realistic, realistic won, and the parameter
lives in [`src/truckSpec.ts`](src/truckSpec.ts).

Published at: <https://digomes87.github.io/PlayDrive/>

The interface is available in English (the default) and Brazilian Portuguese. The flags at the top
of the menu switch between them, and the choice is kept in the browser. The names below are those
of the English interface.

## Run locally

Requires Node 22 or newer.

```bash
npm install
npm run dev        # development server
npm test           # physics and simulation tests (Vitest)
npm run test:e2e   # browser tests (npx playwright install chromium first)
npm run build      # builds dist/
npm run preview    # serves the build under /PlayDrive/
```

## Controls

| Keyboard | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `S` / `↓` | Service brake |
| `A` / `D`, `←` / `→` | Steer |
| `Shift` | Fine steering (25 % of the rate) |
| `Space` | Parking brake valve |
| `G` | Gear selector R · N · D |
| `C` | Camera: chase, cab, yard, trailer |
| `H` | Horn |
| `R` / `Esc` | Restart the mission / menu |

Gamepad in the driver layout: left stick steers, right trigger is the throttle, left trigger the
brake. `A` gear, `B` parking brake, `X` horn, `Y` camera, `LB` fine steering. Expo and deadzone are
adjustable in the menu. Keyboard and gamepad work together.

## Missions

1. **Free training**: no clock, cones and an open dock.
2. **First delivery**: back the trailer into the free bay between two parked trailers.
3. **Alley dock**: drive past the alley mouth, then back the trailer 90 degrees between the walls.
4. **Loading street**: parallel park in the gap between two trailers along the wall.
5. **Reverse slalom**: offset cone gates; the trailer must not fold past the limit.
6. **The gate**: thread the narrow gate, turn around in the yard and back into the loading door.

The mission closes when the trailer is entirely inside the target rectangle, still, with the
parking brake applied, for 1.5 s. The score starts at 1000 and charges time over par, the worst
articulation, the final alignment, collisions and harsh stops. Best results are kept in
`localStorage`.

At the end of a mission, **Review the manoeuvre** replays everything at 4×. The replay is not a
video: the simulation is deterministic, so it runs the mission again with the recorded commands and
arrives at the same state.

## Physical model

Everything in SI, in `src/physics`, with no Three.js dependency. Fixed 120 Hz step decoupled from
the frame rate (accumulator), with the state interpolated for rendering. The simulation is
deterministic: same input, same state.

### The combination

Tractor and trailer are two rigid bodies on the yard plane — position, heading, forward and
lateral speed, yaw rate each — integrated together by RK4:

- **Engine**: torque curve (2100 N·m flat between 1100 and 1400 rpm, cut at the governor),
  automated manual transmission with eight gears, torque interrupt during shifts, clutch launch
  below 1.5 m/s and creep in gear with the brakes off.
- **Tyres**: one axle model per group. Lateral force grows with the slip speed until the axle
  saturates at μ·Fz (0.85 on dry asphalt); the friction circle then shares the budget with braking
  and traction, so locking the wheels while steering plows straight ahead.
- **Vertical loads**: static axle loads from the geometry, including the kingpin load on the fifth
  wheel, plus quasi-static longitudinal load transfer — braking unloads the trailer axle and loads
  the tractor front axle.
- **Fifth wheel**: a stiff, near-critical spring-damper joint that transmits push and pull, but no
  yaw moment — the trailer pivots freely on the kingpin, as it should. Steady stretch under braking
  is a few millimetres.
- **Steering**: rate-limited column (full lock in 1.8 s, faster return, fine mode at 25 %) and
  Ackermann geometry on the front axle.

Consequences that come out of the model rather than being scripted:

- reversing is unstable: the trailer drifts and the driver must correct, or it folds;
- a jackknife beyond 55° warns, beyond 80° the mission fails;
- harsh braking with the combination out of line lets the trailer swing — the tyres saturate;
- the truck creeps in gear with the brakes released, and holds still with a closed brake valve.

### Collisions

Tractor and trailer are oriented boxes against the static obstacles (walls, dock buildings,
parked trailers, cones) via SAT, with push-out and an impulse response at the contact point that
kills the closing speed. Impacts above 0.3 m/s count as collisions on the score.

## Tests

`npm test` runs 60 tests, among them:

- torque curve at the knots and between them, clutch launch band, shift logic with hysteresis;
- friction budget never exceeded on launch; straight reverse that stays straight; constant turn
  with the trailer settling at the articulation the geometry predicts; brake to standstill that
  stays at standstill; jackknife with the wheel hard over; determinism;
- SAT separation, wall stop with impact counting, no tunnelling at walking pace;
- every mission starts clear of obstacles and every zone fits a parked trailer;
- the whole dock mission driven from start to finish by a test autopilot — zero collisions — and
  its replay reaching the same elapsed time and score.

## Known limitations

- The world is flat and planar: no suspension travel, no roll, no grade.
- Tyres are a velocity-based model with saturation, not a Pacejka set with relaxation length.
- The engine has no clutch pedal dynamics; launch is a smooth engagement factor.
- Cones are rigid: they do not topple, they are obstacles like the walls.
- Articulation past the mechanical limit is clamped, not resolved as a contact.
- The gamepad mapping has unit coverage in the layout, but was not tried with a physical pad.
- Missions were tuned for the autopilot and quick manual passes; alley, street and gate may still
  be tighter or looser than they should.

## Structure

```
src/
  truckSpec.ts   every reference value of the combination
  physics/       pure, testable core: engine, tyres, steering, RK4 vehicle
  sim/           step orchestration, collisions, missions, parking check, progress, scoring, replay
  i18n/          interface languages and the text of each
  render/        Three.js scene, procedural truck, sites, cameras
  input/         keyboard, gamepad, response curves
  ui/            instrument panel, menus, audio
tests/           Vitest tests (physics, simulation, autopilot playthrough)
```

## Deploy

The [`deploy.yml`](.github/workflows/deploy.yml) workflow tests, builds and publishes `main` to
GitHub Pages. In the repository, under *Settings → Pages*, the source must be **GitHub Actions**.
The Vite `base` is set to `/PlayDrive/`.

The branch flow is gitflow with automatic promotion: `feature/*` lands in `develop`; when the CI of
`develop` passes (types, tests, build), the `promote` job merges into `main`, tags the package
version if it does not exist yet, and dispatches the deploy. Nobody pushes to `main` directly.

The documentation is written in English; this file is the English version of
[README.pt-BR.md](README.pt-BR.md) and must be updated together with it.
