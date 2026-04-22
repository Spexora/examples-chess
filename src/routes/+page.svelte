<script lang="ts">
  import { goto } from '$app/navigation';

  let selectedColor: 'white' | 'black' | null = null;
  let loading = false;
  let error = '';

  async function createGame() {
    if (!selectedColor) {
      error = 'Please choose a color to play as.';
      return;
    }
    loading = true;
    error = '';
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ color: selectedColor }),
      });
      if (!res.ok) throw new Error('Failed to create game');
      const { gameId } = await res.json();
      goto(`/game/${gameId}`);
    } catch (e) {
      error = 'Could not create game. Please try again.';
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Chess</title>
</svelte:head>

<main class="home">
  <div class="home-card">
    <h1 class="title">♟ Chess</h1>
    <p class="subtitle">Challenge a friend to a game</p>

    <div class="color-choice">
      <p class="label">Play as</p>
      <div class="color-buttons">
        <button
          class="color-btn {selectedColor === 'white' ? 'selected' : ''}"
          on:click={() => (selectedColor = 'white')}
          aria-pressed={selectedColor === 'white'}
        >
          <span class="piece-icon">♔</span>
          White
        </button>
        <button
          class="color-btn {selectedColor === 'black' ? 'selected' : ''}"
          on:click={() => (selectedColor = 'black')}
          aria-pressed={selectedColor === 'black'}
        >
          <span class="piece-icon">♚</span>
          Black
        </button>
      </div>
    </div>

    {#if error}
      <p class="error">{error}</p>
    {/if}

    <button class="create-btn" on:click={createGame} disabled={loading}>
      {loading ? 'Creating…' : 'Create Game & Get Invite Link'}
    </button>
  </div>
</main>

<style>
  .home {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    background: var(--bg-primary);
  }

  .home-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 3rem;
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .title {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--text-primary);
    text-align: center;
    letter-spacing: -1px;
  }

  .subtitle {
    color: var(--text-secondary);
    text-align: center;
    font-size: 1rem;
  }

  .label {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 0.5rem;
  }

  .color-buttons {
    display: flex;
    gap: 1rem;
  }

  .color-btn {
    flex: 1;
    background: var(--bg-secondary);
    border: 2px solid var(--border);
    color: var(--text-primary);
    padding: 1rem;
    font-size: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    border-radius: 8px;
    transition:
      border-color 100ms ease,
      background-color 100ms ease,
      transform 100ms ease;
  }

  .color-btn:hover {
    border-color: var(--border-hover);
    background: var(--bg-input);
    transform: translateY(-2px);
  }

  .color-btn.selected {
    border-color: var(--accent);
    background: var(--bg-input);
    color: var(--accent);
  }

  .piece-icon {
    font-size: 2rem;
    line-height: 1;
  }

  .create-btn {
    background: var(--accent);
    color: #000;
    padding: 14px 24px;
    font-size: 1rem;
    font-weight: 700;
    border-radius: 8px;
    width: 100%;
    letter-spacing: 0.3px;
  }

  .create-btn:hover {
    background: var(--accent-hover);
  }

  .create-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .error {
    color: #ef4444;
    font-size: 0.875rem;
    text-align: center;
  }
</style>
