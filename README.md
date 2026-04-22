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

- Game state is stored **in-memory** on the server (a Map of game ID → game state)
- Clients send moves via **POST** to `/api/games/:id/move`; the server validates with chess.js
- After each accepted move, the server broadcasts the new state to all connected clients via **SSE**
- Clients subscribe to `/api/games/:id/sse` and update the board in real time
- **Player identity** is stored in a server-side cookie (`playerId`) set when creating or joining a game
- Game creation uses a standard HTML form (`POST /?/createGame`) handled by a SvelteKit **form action**. The form action redirects to `/game/:id?pid=<hostId>`. The game page's server-side load function reads the player identity from the cookie first, then falls back to the `?pid=` URL parameter. This guarantees the host is correctly identified even when SvelteKit's client-side router follows the redirect before the `Set-Cookie` header from the form-action response is committed to the browser's cookie store — a race condition that reliably manifests when the server is accessed via a LAN/IP address. After the page mounts, `replaceState` strips `?pid=` from the address bar so that the clean `/game/:id` URL appears in the invite-link box and is safe to share.
- The SSE endpoint accepts the player ID via the `?pid=` query parameter as a reliable fallback, because `EventSource` does not support custom headers and cookies may not be forwarded in all environments (proxies, certain browser configurations, etc.)
- The SSE stream uses a proper `cancel()` cleanup hook (not the ignored `start()` return value), a 25-second heartbeat to keep connections alive through proxies, and `X-Accel-Buffering: no` to prevent reverse-proxy buffering
- The move API response includes the new game state; the moving player's board is updated immediately from that response rather than waiting for the SSE echo, so both players see changes in real time
