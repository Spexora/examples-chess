<script lang="ts">
  import type { PageData } from './$types.js';
  import type { Game, GameEvent, ChatMessage } from '$lib/server/types.js';
  import Board from './components/Board.svelte';
  import Chat from './components/Chat.svelte';
  import { onMount, onDestroy, untrack } from 'svelte';

  let { data }: { data: PageData } = $props();

  // game is managed as independent local state — updated by SSE events and
  // move API responses (not tied to data prop).
  let game: Game = $state(untrack(() => data.game));

  // playerId and isFull start from server-rendered data but are updated
  // client-side in onMount (joining, identity recovery).  untrack() tells
  // Svelte we intentionally take a snapshot — these become independent local
  // state variables that we manage ourselves.
  let playerId: string = $state(untrack(() => data.playerId ?? ''));
  let isFull: boolean = $state(untrack(() => data.isFull));

  let eventSource: EventSource | null = $state(null);
  let moveError = $state('');
  let copySuccess = $state(false);

  // Derived view state.
  let playerColor = $derived(
    game.hostId === playerId ? game.hostColor : game.hostColor === 'white' ? 'black' : 'white'
  );
  let isMyTurn = $derived(game.status === 'active' && game.turn === playerColor);
  // Invite URL is always the clean /game/:id — built after mount so
  // window.location.origin is available.
  let inviteUrl = $state('');

  function connectSSE() {
    if (!playerId || typeof EventSource === 'undefined') return;
    eventSource?.close();
    // Pass playerId as a query parameter: EventSource doesn't support custom
    // headers, and cookies may not be forwarded reliably on all environments
    // (proxies, LAN/IP, certain SvelteKit dev-server configurations).
    const url = `/api/games/${game.id}/sse?pid=${encodeURIComponent(playerId)}`;
    eventSource = new EventSource(url);
    eventSource.onmessage = (e) => {
      try {
        const ev: GameEvent = JSON.parse(e.data);
        if (ev.type === 'ping') return; // heartbeat only
        // Merge incoming state into the local game object.
        game = { ...game, ...(ev.data as Game) };
      } catch {
        // Malformed frame — ignore.
      }
    };
    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      setTimeout(connectSSE, 3000);
    };
  }

  onMount(async () => {
    // Build the clean invite URL from the actual origin (not available SSR).
    inviteUrl = `${window.location.origin}/game/${game.id}`;

    // Strip the one-time ?h= host token from the address bar — it has already
    // been consumed by the server-side load function.
    if (window.location.search.includes('h=')) {
      history.replaceState(null, '', window.location.pathname);
    }

    if (!playerId) {
      // Unknown visitor (cookie missing or never set).
      // Check sessionStorage for a previously stored identity (covers the
      // "host refreshes page and cookie was lost" case), then call the join
      // endpoint.  The join endpoint:
      //   • accepts X-Player-Id for identity recovery (host / returning guest)
      //   • generates a fresh UUID for brand-new guests
      //   • always (re-)commits the playerId cookie in its response
      // After the fetch() Promise resolves, the cookie is guaranteed to be
      // committed to the browser jar, so subsequent move / chat requests work.
      const stored = sessionStorage.getItem(`chess-pid-${game.id}`);
      const headers: Record<string, string> = {};
      if (stored) headers['X-Player-Id'] = stored;

      const res = await fetch(`/api/games/${game.id}/join`, { method: 'POST', headers });

      if (res.ok) {
        const body = await res.json();
        playerId = body.playerId;
        game = body.game;
        isFull = false;
        sessionStorage.setItem(`chess-pid-${game.id}`, playerId);
      } else {
        // Game is full or some other error — visitor cannot participate.
        isFull = true;
      }
    } else {
      // Participant already identified server-side — persist in sessionStorage
      // so that the identity can be recovered if the cookie is ever lost.
      sessionStorage.setItem(`chess-pid-${game.id}`, playerId);
    }

    if (!isFull) {
      connectSSE();
    }
  });

  onDestroy(() => {
    eventSource?.close();
  });

  async function handleMove(detail: { from: string; to: string; promotion?: string }) {
    moveError = '';
    const { from, to, promotion } = detail;
    try {
      const res = await fetch(`/api/games/${game.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, promotion }),
      });
      const body = await res.json();
      if (!body.accepted) {
        moveError = body.reason ?? 'Move rejected';
      } else if (body.game) {
        game = body.game;
      }
    } catch {
      moveError = 'Network error. Please try again.';
    }
  }

  async function copyInviteLink() {
    try {
      // navigator.clipboard requires HTTPS or localhost.  On plain HTTP (e.g.
      // LAN/IP in dev mode), fall back to the legacy execCommand approach.
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteUrl);
      } else {
        const ta = document.createElement('textarea');
        ta.value = inviteUrl;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      copySuccess = true;
      setTimeout(() => (copySuccess = false), 2000);
    } catch {
      // Silent fail — the URL is visible in the invite box so the user can
      // copy it manually.
    }
  }

  function handleMessageSent(msg: ChatMessage) {
    if (!game.chat.some((m) => m.id === msg.id)) {
      game = { ...game, chat: [...game.chat, msg] };
    }
  }

  function statusText(): string {
    if (isFull) return 'This game is full or unavailable.';
    if (game.status === 'waiting') return 'Waiting for opponent…';
    if (game.status === 'finished') {
      if (game.result === 'draw') {
        const reason =
          game.drawReason === 'stalemate' ? 'Stalemate'
          : game.drawReason === 'insufficient_material' ? 'Insufficient material'
          : game.drawReason === 'threefold_repetition' ? 'Threefold repetition'
          : 'Fifty-move rule';
        return `Draw — ${reason}`;
      }
      if (game.result === playerColor) return '🎉 You win!';
      return 'You lose.';
    }
    if (game.inCheck) return isMyTurn ? '⚠️ You are in check!' : 'Opponent is in check';
    return isMyTurn ? 'Your turn' : "Opponent's turn";
  }
</script>

<svelte:head>
  <title>{game.status === 'waiting' ? 'Waiting for Opponent' : 'Chess Game'}</title>
</svelte:head>

{#if isFull}
  <main class="full-page">
    <div class="info-card">
      <h1>Game Unavailable</h1>
      <p>This game is full or no longer accepting players.</p>
      <a href="/" class="btn-link">← Start a new game</a>
    </div>
  </main>
{:else if game.status === 'waiting'}
  <main class="lobby">
    <div class="lobby-card">
      <h1 class="title">♟ Waiting for Opponent</h1>
      <p class="color-info">
        You are playing as <strong>{playerColor}</strong>
      </p>

      <div class="invite-section">
        <p class="invite-label">Share this link with your opponent:</p>
        <div class="invite-link-box">
          <span class="invite-url">{inviteUrl}</span>
          <button class="copy-btn" onclick={copyInviteLink}>
            {copySuccess ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div class="board-preview">
        <Board {game} {playerId} onmove={() => {}} />
      </div>
      <p class="board-disabled-note">The board is not active until the game starts.</p>
    </div>
  </main>
{:else}
  <main class="game">
    <div class="game-layout">
      <section class="board-section">
        <div class="status-bar" class:my-turn={isMyTurn} class:in-check={game.inCheck} class:finished={game.status === 'finished'}>
          {statusText()}
        </div>
        {#if moveError}
          <p class="move-error">{moveError}</p>
        {/if}
        <Board {game} {playerId} onmove={handleMove} />
        <div class="player-info">
          <div class="player">
            <span class="piece-icon">{playerColor === 'white' ? '♔' : '♚'}</span>
            <span>You ({playerColor})</span>
          </div>
        </div>
      </section>

      <aside class="side-panel">
        <Chat messages={game.chat} {playerId} gameId={game.id} disabled={game.status === 'finished'} onMessageSent={handleMessageSent} />
      </aside>
    </div>
  </main>
{/if}

<style>
  .full-page,
  .lobby {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
  }

  .info-card,
  .lobby-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 2.5rem;
    max-width: 600px;
    width: 100%;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .title {
    font-size: 2rem;
    font-weight: 700;
    text-align: center;
  }

  .color-info {
    text-align: center;
    color: var(--text-secondary);
    font-size: 1rem;
  }

  .color-info strong {
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .invite-label {
    color: var(--text-secondary);
    font-size: 0.875rem;
    margin-bottom: 0.5rem;
  }

  .invite-link-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 12px;
  }

  .invite-url {
    flex: 1;
    font-size: 0.875rem;
    color: var(--text-secondary);
    word-break: break-all;
    font-family: monospace;
  }

  .copy-btn {
    background: var(--accent);
    color: #000;
    font-size: 0.8rem;
    padding: 6px 12px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .copy-btn:hover {
    background: var(--accent-hover);
  }

  .board-preview {
    display: flex;
    justify-content: center;
    opacity: 0.5;
    pointer-events: none;
  }

  .board-disabled-note {
    color: var(--text-muted);
    font-size: 0.8rem;
    text-align: center;
  }

  .btn-link {
    display: inline-block;
    background: var(--accent);
    color: #000;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
  }

  .btn-link:hover {
    background: var(--accent-hover);
    text-decoration: none;
  }

  /* Active game layout */
  .game {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem 2rem;
    background: var(--bg-primary);
  }

  .game-layout {
    display: flex;
    gap: 1.5rem;
    align-items: flex-start;
    flex-wrap: wrap;
    justify-content: center;
  }

  .board-section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: center;
  }

  .status-bar {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.6rem 1.2rem;
    font-size: 1rem;
    font-weight: 500;
    color: var(--text-secondary);
    min-width: 220px;
    text-align: center;
    transition: all 100ms ease;
  }

  .status-bar.my-turn {
    color: var(--text-primary);
    border-color: var(--border-hover);
  }

  .status-bar.in-check {
    color: #f59e0b;
    border-color: #f59e0b;
  }

  .status-bar.finished {
    color: var(--text-primary);
  }

  .move-error {
    color: #ef4444;
    font-size: 0.85rem;
    text-align: center;
  }

  .player-info {
    display: flex;
    justify-content: center;
  }

  .player {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-secondary);
    font-size: 0.9rem;
  }

  .piece-icon {
    font-size: 1.2rem;
  }

  .side-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>
