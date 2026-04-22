<script lang="ts">
  let selectedColor: 'white' | 'black' | null = $state(null);
  let validationError = $state('');
  let loading = $state(false);

  function handleSubmit(event: SubmitEvent) {
    if (!selectedColor) {
      event.preventDefault();
      validationError = 'Please choose a color to play as.';
      return;
    }
    validationError = '';
    loading = true;
  }
</script>

<svelte:head>
  <title>Chess</title>
</svelte:head>

<main class="home">
  <div class="home-card">
    <h1 class="title">♟ Chess</h1>
    <p class="subtitle">Challenge a friend to a game</p>

    <form
      method="POST"
      action="?/createGame"
      onsubmit={handleSubmit}
    >
      <input type="hidden" name="color" value={selectedColor ?? ''} />

      <div class="color-choice">
        <p class="label">Play as</p>
        <div class="color-buttons">
          <button
            type="button"
            class="color-btn {selectedColor === 'white' ? 'selected' : ''}"
            onclick={() => (selectedColor = 'white')}
            aria-pressed={selectedColor === 'white'}
          >
            <span class="piece-icon">♔</span>
            White
          </button>
          <button
            type="button"
            class="color-btn {selectedColor === 'black' ? 'selected' : ''}"
            onclick={() => (selectedColor = 'black')}
            aria-pressed={selectedColor === 'black'}
          >
            <span class="piece-icon">♚</span>
            Black
          </button>
        </div>
      </div>

      {#if validationError}
        <p class="error">{validationError}</p>
      {/if}

      <button type="submit" class="create-btn" disabled={loading}>
        {loading ? 'Creating…' : 'Create Game & Get Invite Link'}
      </button>
    </form>
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
    padding: 2.5rem 2rem;
    width: 100%;
    max-width: 420px;
    box-shadow: var(--shadow);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  form {
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

  .color-choice {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .label {
    color: var(--text-secondary);
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 1px;
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
