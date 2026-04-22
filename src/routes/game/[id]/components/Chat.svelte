<script lang="ts">
  import type { ChatMessage } from '$lib/server/types.js';

  let {
    messages = [],
    playerId,
    gameId,
    disabled = false,
    onMessageSent = undefined,
  }: {
    messages?: ChatMessage[];
    playerId: string;
    gameId: string;
    disabled?: boolean;
    onMessageSent?: ((msg: ChatMessage) => void) | undefined;
  } = $props();

  let inputText = $state('');
  let sending = $state(false);
  let messagesEl = $state<HTMLDivElement | undefined>(undefined);

  async function sendMessage() {
    if (!inputText.trim() || sending || disabled) return;
    sending = true;
    const text = inputText.trim();
    inputText = '';
    try {
      const res = await fetch(`/api/games/${gameId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        const body = await res.json();
        // Optimistically surface the message for the sender immediately.
        // The SSE chat_message event will deliver it to the opponent and
        // will also arrive for the sender — duplicates are deduplicated by
        // the `(msg.id)` key in the {#each} loop.
        if (body.message && onMessageSent) {
          onMessageSent(body.message);
        }
      }
    } catch {
      inputText = text;
    } finally {
      sending = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  $effect(() => {
    // Re-run whenever messages changes so the list scrolls to the latest entry.
    if (messages && messagesEl) {
      const el = messagesEl;
      setTimeout(() => {
        el?.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      }, 0);
    }
  });
</script>

<aside class="chat-panel">
  <header class="chat-header">
    <h2>Chat</h2>
  </header>

  <div class="messages" bind:this={messagesEl}>
    {#if messages.length === 0}
      <p class="empty">No messages yet</p>
    {/if}
    {#each messages as msg (msg.id)}
      <div class="message {msg.playerId === playerId ? 'mine' : 'theirs'}">
        <span class="sender">{msg.playerColor === 'white' ? '♔ White' : '♚ Black'}</span>
        <p class="text">{msg.text}</p>
      </div>
    {/each}
  </div>

  <form class="chat-form" onsubmit={(e) => { e.preventDefault(); sendMessage(); }}>
    <input
      type="text"
      bind:value={inputText}
      placeholder="Type a message…"
      disabled={disabled || sending}
      onkeydown={handleKeydown}
      maxlength="500"
    />
    <button type="submit" disabled={disabled || sending || !inputText.trim()}>Send</button>
  </form>
</aside>

<style>
  .chat-panel {
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    width: var(--chat-width);
    min-width: 240px;
    height: clamp(300px, 60vmin, 560px);
    box-shadow: var(--shadow);
  }

  .chat-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }

  .chat-header h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    scrollbar-width: thin;
    scrollbar-color: var(--border) transparent;
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.875rem;
    text-align: center;
    margin-top: 1rem;
  }

  .message {
    max-width: 85%;
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .message.mine {
    background: var(--bg-input);
    align-self: flex-end;
  }

  .message.theirs {
    background: var(--bg-secondary);
    align-self: flex-start;
  }

  .sender {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .text {
    font-size: 0.9rem;
    color: var(--text-primary);
    word-break: break-word;
  }

  .chat-form {
    padding: 0.75rem;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 0.5rem;
  }

  .chat-form input {
    flex: 1;
    min-width: 0;
    font-size: 0.875rem;
    padding: 8px 10px;
  }

  .chat-form button {
    background: var(--accent);
    color: #000;
    font-size: 0.875rem;
    padding: 8px 14px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .chat-form button:hover:not(:disabled) {
    background: var(--accent-hover);
  }

  .chat-form button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }
</style>
