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
- **Player identity** is stored in a server-side cookie (`playerId`) set when creating or joining a game
- Game creation uses a **two-step navigation** to guarantee reliable cookie delivery on both localhost and LAN/IP addresses:
  1. The home page calls `POST /api/games` via JavaScript `fetch` and receives `{ gameId, hostId }`.
  2. It navigates to `/game/:id?h=<hostId>` via `window.location.href`.
  3. The game page's server-side `load` function validates the `?h=` token against `game.hostId`, sets the `playerId` cookie in the HTTP response headers, and issues a **302 redirect** to the clean `/game/:id` URL.
  4. The browser processes the `Set-Cookie` header from the redirect response **before** following the redirect — this is guaranteed by the HTTP specification and is reliable on every browser and network configuration. The lobby is shown on the clean URL.
- The invite URL shown to the host is always the clean `/game/:id` URL with no query parameters.
- The SSE endpoint accepts the player ID via the `?pid=` query parameter as a reliable fallback, because `EventSource` does not support custom headers and cookies may not be forwarded in all environments (proxies, certain browser configurations, etc.)
- The SSE stream uses a proper `cancel()` cleanup hook (not the ignored `start()` return value), a 25-second heartbeat to keep connections alive through proxies, and `X-Accel-Buffering: no` to prevent reverse-proxy buffering
- The move API response includes the new game state; the moving player's board is updated immediately from that response rather than waiting for the SSE echo, so both players see changes in real time
