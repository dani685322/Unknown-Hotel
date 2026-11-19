# Unknown Hotel

A procedural horror-survival game built with Three.js and an authoritative Node.js WebSocket server. Explore 100 changing rooms, avoid entities, manage supplies, and play with friends through public or private parties.

## Features

- Procedurally generated 100-door runs with reproducible shared seeds.
- Public and private multiplayer parties with party codes.
- Party leader, bots, member moderation, difficulty selection, and live chat.
- Five difficulties: Easy, Normal, Hard, Extreme, and Hell.
- Shared movement, room progression, and party start synchronization.
- Rush and Ambush encounters with hide warnings and spectator mode.
- Owner-only Admin terminal with runtime commands.
- Lockers, crouching, sprinting, loot, medkits, lamps, doors, and hiding spots.

## Controls

| Key | Action |
| --- | ------ |
| `W` `A` `S` `D` | Move |
| Mouse | Look and aim |
| `L Shift` | Sprint |
| `L Ctrl` | Crouch |
| `E` | Interact, enter a locker, or leave a locker |
| `Q` | Use the selected item |
| `F` | Toggle the lamp |
| `T` or `Enter` | Open party chat |
| `Escape` | Close party chat or Admin |
| `Space` | Drop item |
| `/` | Open the owner Admin terminal |

## Multiplayer

1. Start the backend and browser app.
2. Create an account or log in.
3. Connect to the lobby.
4. Create a public or private party.
5. Share a private party code or use a public party's Join button.
6. Add bots or wait for party members.
7. The party leader starts the hotel.

Public parties and private party codes both support up to four human or bot slots.

## Rush and Ambush

- **Rush:** Red entity that starts at a distance and runs toward visible players.
- **Ambush:** Green entity that stalks or retreats based on the player's lamp and hiding state.
- When an entity arrives, the lights flicker three times.
- Players have five seconds to enter a locker or crouch.
- A player who fails to hide enters spectator mode and can follow another player.

## Getting Started

### Requirements

Before starting the game, install:

- [Node.js](https://nodejs.org/) 18 or newer.
- npm, included with Node.js.
- A modern desktop browser such as Chrome, Edge, or Firefox.
- Two browser windows or devices only if you want to test multiplayer.

### 1. Download and install

```bash
git clone https://github.com/dani685322/Unknown-Hotel.git
cd Unknown-Hotel
npm install
```

If the project is already downloaded, open its folder in VS Code and skip the clone command.

### 2. Start the game

Start both the browser app and multiplayer backend with one command:

```bash
npm run dev:all
```

Keep the terminal open while playing. This command starts:

- The game in Vite on `http://localhost:5173`.
- The API and WebSocket server on `http://localhost:8080`.
- `/api` and `/ws` browser connections through port `5173`.

Open [http://localhost:5173](http://localhost:5173) in the browser. For GitHub Codespaces or another forwarded environment, open the forwarded HTTPS address for port `5173`, not a direct `localhost:8080` address.

To stop the servers, press `Ctrl+C` in the terminal running `dev:all`. Restart with the same command after source changes or server restarts.

### 3. Start a single-player run

1. Open `http://localhost:5173`.
2. Select **Enter the hotel** from the title screen.
3. Use the mouse to look and `W A S D` to move.
4. Press `E` to interact with doors and lockers.
5. Reach and unlock the next door to progress through the run.

### 4. Start a multiplayer party

1. Open the game and select **Multiplayer Beta**.
2. Sign up for a new account or log in.
3. Press **Connect** if the lobby is not already connected.
4. Create a party with a name, public/private visibility, and difficulty.
5. Share the party code for a private party. Public parties can be joined from **Public Parties**.
6. The leader can add bots or wait for one to three players.
7. Press **Start Hotel** when at least two human or bot slots are present.

Refresh both browser tabs after restarting the backend or applying source changes.

### Start the services separately

Start only the browser app:

```bash
npm run dev
```

Start only the API and WebSocket backend:

```bash
npm run server
```

Use separate terminals if both services need to run independently. The browser app still expects the backend on port `8080`.

### Build and validation

Create a production build:

```bash
npm run build
```

Check the server JavaScript and README worktree:

```bash
node --check server/index.js
git diff --check
```

## Admin

The Admin terminal is available only to the server owner account. Open it with `/`, a backtick, or `Ctrl+Shift+A`.

Useful commands:

```text
/help
/rooms
/tp <roomId>
/spawn <chaser|rush|ambush> [room]
/kill <entityId|entityType>
/noclip
/god
/timescale <n>
/stats
/close
```

Prefixing commands with `/` is optional. Press `Escape` or use `/close` or `/terminal` to dismiss the terminal.

## Updating the Changelog

Every update to Unknown Hotel must include a README changelog entry. Add the newest entry to the top of **Updates** with the date and the affected systems.

Use this format:

```markdown
### YYYY-MM-DD - Short update title

- Added or changed behavior.
- Fixed bug or clarified a limitation.
- Validation performed, when useful.
```

Do not remove old entries. Keep entries concise and describe what the player can now do or what changed behaviorally.

## Updates

### 2026-11-19 - Rush and Ambush encounter logic

- Added red Rush and green Ambush entity skins.
- Changed both entities to spawn at a distance and run toward the player instead of teleporting.
- Added hidden and crouched-player pursuit prevention.
- Added three light flickers and a five-second hide warning.
- Added safe hiding: Rush or Ambush leaves after the player hides.
- Added spectator mode after a missed hide, including camera following another party member.

### 2026-11-19 - Locker and Admin controls

- Added `E` to enter and `E` again to leave lockers.
- Fixed locker exit position and movement-state cleanup.
- Fixed Admin console typing by preventing the global key trap from blocking normal input.
- Added `/close`, `/terminal`, and `Escape` to dismiss Admin.
- Preserved `/` as the Admin open shortcut.

### 2026-11-19 - Multiplayer start synchronization

- Added shared party run seeds so the hotel layout is consistent for every member.
- Added shared leader room progression and player-state synchronization.
- Added explicit `party_started` acknowledgements and visible lobby status feedback.
- Added runtime start error handling.

### 2026-11-19 - Party, chat, difficulty, and joining improvements

- Added public party discovery with Join buttons.
- Added private party joining by code.
- Added automatic lobby WebSocket connection after authentication.
- Added upper-case party code normalization and explicit join success feedback.
- Added Easy, Normal, Hard, Extreme, and Hell difficulties.
- Added party bots, leadership transfer, kick, ban, and live party chat with `T` or `Enter`.

### 2026-11-19 - Initial multiplayer foundation

- Added account login and registration.
- Added WebSocket lobby, party creation, party members, and party leave actions.
- Added Three.js multiplayer remote player meshes.
- Added same-origin API and WebSocket proxy support on port `5173`.
- Added the Node.js multiplayer backend on port `8080`.
