<script lang="ts">
  import type { PageData } from './$types.js';
  import type { Game, GameEvent, ChatMessage } from '$lib/server/types.js';
  import Board from './components/Board.svelte';
  import Chat from './components/Chat.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { page } from '$app/stores';

  export let data: PageData;

  let game: Game = data.game;
  let playerId: string = data.playerId;
  let isFull: boolean = data.isFull;
  let eventSource: EventSource | null = null;
  let moveError = '';
  let copySuccess = false;

  $: playerColor = game.hostId === playerId ? game.hostColor : game.hostColor === 'white' ? 'black' : 'white';
  $: isParticipant = game.hostId === playerId || game.guestId === playerId;
  $: isMyTurn = game.status === 'active' && game.turn === playerColor;
  $: inviteUrl = typeof window !== 'undefined' ? `${window.location.origin}/game/${game.id}` : `/game/${game.id}`;

  function connectSSE() {
    if (!isParticipant || typeof EventSource === 'undefined') return;
    // Close any existing connection before opening a new one.
    eventSource?.close();
    // Pass playerId as a query parameter because EventSource does not
    // support custom headers and cookies may not be forwarded reliably in
    // all environments (proxies, certain SvelteKit dev/build configs, etc.)
    const url = `/api/games/${game.id}/sse?pid=${encodeURIComponent(playerId)}`;
    eventSource = new EventSource(url);
    eventSource.onmessage = (e) => {
      try {
        const event: GameEvent = JSON.parse(e.data);
        // Ignore heartbeat pings — they carry no game state.
        if (event.type === 'ping') return;
        game = { ...game, ...(event.data as Game) };
      } catch {
        // Malformed message — ignore.
      }
    };
    eventSource.onerror = () => {
      // Close the broken connection and reconnect after a short delay.
      // EventSource has built-in reconnection, but we close explicitly so
      // we control the timing and avoid stale handlers.
      eventSource?.close();
      setTimeout(connectSSE, 3000);
    };
  }

  onMount(() => {
    connectSSE();
  });

  onDestroy(() => {
    eventSource?.close();
  });

  async function handleMove(e: CustomEvent<{ from: string; to: string; promotion?: string }>) {
    moveError = '';
    const { from, to, promotion } = e.detail;
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
        // Apply the updated game state immediately from the API response so
        // the player who moved sees the result right away.  The SSE stream
        // will also deliver a state_update to both players shortly after,
        // which is the canonical update for the opponent.
        game = body.game;
      }
    } catch {
      moveError = 'Network error. Please try again.';
    }
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      copySuccess = true;
      setTimeout(() => (copySuccess = false), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  }

  function handleMessageSent(msg: ChatMessage) {
    // Optimistically surface the sent message for the local player immediately.
    // When the SSE chat_message event arrives it will carry the full chat
    // array from the server, which naturally deduplicates any temporary
    // optimistic entry because the {#each} loop uses msg.id as the key.
    if (!game.chat.some((m) => m.id === msg.id)) {
      game = { ...game, chat: [...game.chat, msg] };
    }
  }

  function statusText(): string {
    if (isFull) return 'This game is full or unavailable.';
    if (game.status === 'waiting') return 'Waiting for opponent…';
    if (game.status === 'finished') {
      if (game.result === 'draw') {
        const reason = game.drawReason === 'stalemate' ? 'Stalemate'
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
        You are playing as <strong>{game.hostColor === playerColor ? game.hostColor : (game.hostColor === 'white' ? 'black' : 'white')}</strong>
      </p>

      <div class="invite-section">
        <p class="invite-label">Share this link with your opponent:</p>
        <div class="invite-link-box">
          <span class="invite-url">{inviteUrl}</span>
          <button class="copy-btn" on:click={copyInviteLink}>
            {copySuccess ? '✓ Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      <div class="board-preview">
        <Board {game} {playerId} on:move={() => {}} />
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
        <Board {game} {playerId} on:move={handleMove} />
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
