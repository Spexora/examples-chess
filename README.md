# Chess

An open-source chess application built with SvelteKit. Play against a friend by sharing an invite link — no account required.

## Features

- **Lobby system**: Host creates a game, chooses a color (White or Black), and shares an invite link
- **Real-time gameplay**: Game state delivered to both players via Server-Sent Events (SSE)
- **Server-side validation**: All moves validated on the server using chess.js
- **Full chess rules**: Castling, en passant, promotion, check, checkmate, stalemate, and all draw conditions (threefold repetition, 50-move rule, insufficient material)
- **In-game chat**: Both players can send messages during the game
- **Dark/white theme**: Clean, modern interface with hover effects, piece animations, and legal move highlighting

## Tech Stack

- **Frontend + Backend**: [SvelteKit](https://kit.svelte.dev/)
- **Chess engine**: [chess.js](https://github.com/jhlywa/chess.js)
- **Real-time updates**: Server-Sent Events (SSE)
- **Tests**: [Cucumber.js](https://cucumber.io/) with BDD-style feature files

## Getting Started

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for production

```bash
npm run build
```

### Start the production server

```bash
npm start
```

The server listens on port `3000` by default.

## Running Tests

```bash
npm test
```

This runs the Cucumber BDD test suite, which covers:

- Chess rules (all standard moves, castling, en passant, promotion, draws)
- Lobby creation and game start flow
- Move API validation and server-side enforcement
- Real-time state sync via SSE
- Chat functionality and access control
- Board interactions (hover effects, legal move highlighting, animations)
- Visual theme requirements

## How to Play

1. Open the app and click **Create Game & Get Invite Link**
2. Choose to play as **White** or **Black**
3. Copy the invite link and share it with your opponent
4. When your opponent opens the link, the game starts automatically
5. Click a piece to see legal moves (highlighted squares), then click a destination to move
6. Use the chat panel to communicate with your opponent

## Project Structure

```
src/
├── lib/
│   └── server/
│       ├── store.ts       # In-memory game state management
│       └── types.ts       # Shared TypeScript types
├── routes/
│   ├── +layout.svelte     # App layout with global CSS
│   ├── +page.svelte       # Home page (create game)
│   ├── game/[id]/
│   │   ├── +page.server.ts    # Server-side data loading
│   │   ├── +page.svelte       # Game/lobby page
│   │   └── components/
│   │       ├── Board.svelte   # Chess board with interactions
│   │       └── Chat.svelte    # Chat panel
│   └── api/games/
│       ├── +server.ts         # POST /api/games — create game
│       └── [id]/
│           ├── +server.ts     # GET /api/games/:id — get state
│           ├── join/          # POST — join game
│           ├── move/          # POST — submit move
│           ├── chat/          # GET/POST — chat messages
│           └── sse/           # GET — Server-Sent Events stream
features/
└── step_definitions/
    └── stepdefs.ts        # Cucumber BDD step definitions
```

## Architecture

- Game state is stored **in-memory** on the server (a `Map` of game ID → game state). The store is pinned to `globalThis` so that Vite's hot-module replacement in development does not wipe in-flight games between module reloads.
- Clients send moves via **POST** to `/api/games/:id/move`; the server validates with chess.js
- After each accepted move, the server broadcasts the new state to all connected clients via **SSE**
- Clients subscribe to `/api/games/:id/sse` and update the board in real time

### Player identity and game flow

Player identity is managed via a `playerId` cookie (set server-side, `HttpOnly`) combined with `sessionStorage` for reliable cross-environment recovery.

**Game creation (host):**

1. Home page calls `POST /api/games` → receives `{ gameId, hostId }`
2. Stores `hostId` in `sessionStorage['chess-pid-<gameId>']` — synchronous, reliable on all origins
3. Navigates to `/game/:id?h=<hostId>` (full page navigation)
4. Server-side `load` validates the `?h=` token → sets cookie → returns lobby data with `playerId = hostId`
5. `onMount` stores the `playerId` in `sessionStorage` and opens the SSE stream

**Joining (guest) and identity recovery:**

- The server-side `load` function never auto-joins anyone — it only identifies players with a valid cookie or `?h=` token
- `onMount` calls `POST /api/games/:id/join` for any visitor not identified server-side. The join endpoint:
  - Accepts `X-Player-Id` header for identity recovery (cookie was lost but `sessionStorage` still has the ID)
  - Generates a new UUID for fresh guests
  - Always (re-)commits the `playerId` cookie in the response
- After the `fetch()` Promise for join resolves, the cookie is committed; subsequent move and chat requests work correctly

**Why this is reliable on LAN/IP addresses:**

- `sessionStorage` is synchronous and not subject to cookie-timing races
- The join endpoint commits the cookie in its response; `fetch()` guarantees the cookie is in the jar before the Promise resolves
- This eliminates the race where a SvelteKit client-side navigation could reach the server's `load` function before a `Set-Cookie` from a prior response was committed

**SSE:**

- The SSE endpoint accepts the player ID via `?pid=` query parameter because `EventSource` does not support custom headers and cookies may not be forwarded in all proxy environments
- A 25-second heartbeat keeps connections alive through proxies; `X-Accel-Buffering: no` prevents reverse-proxy buffering; `cancel()` handles cleanup

**Clipboard:**

- The copy button uses `navigator.clipboard` on secure contexts (HTTPS / localhost) and falls back to `document.execCommand('copy')` for plain HTTP on LAN
