# Unknown Hotel

A procedurally generated multiplayer horror-survival game. Survive 100 doors of
ever-changing rooms, outrun sound-hunting entities, scavenge scarce loot, and
unlock five specialized classes.

Built with **Three.js** (client) and **Colyseus** (authoritative server), in plain
JavaScript, developed in VS Code / Vite.

---

## Features

- **Procedural labyrinth** — every door (001 → 100) synthesizes a new layout from a
  seeded RNG, so runs are unique yet reproducible.
- **Intelligent entities** — Rush, Ambush, Screech, and Figure each have distinct
  behavioral logic and per-door probability checks.
- **Survival economy** — flashlights, batteries, lighters, lockpicks, vitamins, and
  the rare Crucifix.
- **Five classes** — Scout, Hider, Medic, Lockpicker, Brave.
- **Server-authoritative admin panel** — entity spawning, teleport, godmode, item
  granting, moderation, and economy control.

---

## Controls

| Key | Action |
| --- | ------ |
| `W` `A` `S` `D` | Move |
| Mouse | Look / camera |
| `L Shift` | Sprint |
| `L Ctrl` | Crouch (evade sound-sensitive entities) |
| `E` | Interact / pick up |
| `Q` | Use equipped item |
| `Space` | Drop item |

---

## Getting Started

```bash
git clone https://github.com/dani685322/Unknown-Hotel.git
cd Unknown-Hotel
npm install
npm run dev
