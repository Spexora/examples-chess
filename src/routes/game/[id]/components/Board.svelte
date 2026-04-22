<script lang="ts">
  import type { Game } from '$lib/server/types.js';

  let {
    game,
    playerId,
    onmove = () => {},
  }: {
    game: Game;
    playerId: string;
    onmove?: (detail: { from: string; to: string; promotion?: string }) => void;
  } = $props();

  let playerColor = $derived(
    game.hostId === playerId ? game.hostColor : game.hostColor === 'white' ? 'black' : 'white'
  );
  let isMyTurn = $derived(game.status === 'active' && game.turn === playerColor);

  let selectedSquare: string | null = $state(null);
  let legalMoves: string[] = $state([]);
  let hoveredSquare: string | null = $state(null);

  function getSquareClass(file: number, rank: number): string {
    const isLight = (file + rank) % 2 === 0;
    const squareName = getSquareName(file, rank);
    const isSelected = selectedSquare === squareName;
    const isLegalTarget = legalMoves.includes(squareName);
    const isHovered = hoveredSquare === squareName;

    let cls = isLight ? 'square light' : 'square dark';
    if (isSelected) cls += ' selected';
    if (isLegalTarget) cls += ' legal-target';
    if (isHovered && !isSelected) cls += ' hovered';
    return cls;
  }

  function getSquareName(file: number, rank: number): string {
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    return files[file] + (rank + 1);
  }

  function parseBoard(): (string | null)[][] {
    const board: (string | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
    const rows = game.fen.split(' ')[0].split('/');
    for (let r = 0; r < 8; r++) {
      let file = 0;
      for (const ch of rows[r]) {
        if (/\d/.test(ch)) {
          file += parseInt(ch);
        } else {
          board[7 - r][file] = ch;
          file++;
        }
      }
    }
    return board;
  }

  function pieceToUnicode(piece: string | null): string {
    if (!piece) return '';
    const map: Record<string, string> = {
      K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
      k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
    };
    return map[piece] ?? '';
  }

  function getFilesForColor(): number[] {
    return playerColor === 'black' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  }

  function getRanksForColor(): number[] {
    return playerColor === 'black' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  }

  async function getLegalMovesForSquare(square: string): Promise<string[]> {
    // Import chess.js dynamically to get legal moves for the selected piece
    const { Chess } = await import('chess.js');
    const chess = new Chess(game.fen);
    const moves = chess.moves({ square, verbose: true });
    return moves.map((m: any) => m.to);
  }

  async function handleSquareClick(file: number, rank: number) {
    if (!isMyTurn || game.status !== 'active') return;
    const squareName = getSquareName(file, rank);
    const board = parseBoard();
    const piece = board[rank][file];

    if (selectedSquare === null) {
      // Select a piece if it belongs to the current player
      if (!piece) return;
      const isWhitePiece = piece === piece.toUpperCase();
      const isPlayerPiece =
        (playerColor === 'white' && isWhitePiece) || (playerColor === 'black' && !isWhitePiece);
      if (!isPlayerPiece) return;

      selectedSquare = squareName;
      legalMoves = await getLegalMovesForSquare(squareName);
    } else {
      if (legalMoves.includes(squareName)) {
        // Execute the move
        const from = selectedSquare;
        const to = squareName;

        // Check if pawn promotion is needed
        const board2 = parseBoard();
        const fromFile = 'abcdefgh'.indexOf(from[0]);
        const fromRank = parseInt(from[1]) - 1;
        const pieceAtFrom = board2[fromRank][fromFile];
        const isPromotion =
          pieceAtFrom?.toLowerCase() === 'p' &&
          ((playerColor === 'white' && to[1] === '8') || (playerColor === 'black' && to[1] === '1'));

        selectedSquare = null;
        legalMoves = [];

        onmove({ from, to, promotion: isPromotion ? 'q' : undefined });
      } else if (squareName === selectedSquare) {
        // Deselect
        selectedSquare = null;
        legalMoves = [];
      } else {
        // Try selecting a different piece
        const piece2 = board[rank][file];
        if (piece2) {
          const isWhitePiece = piece2 === piece2.toUpperCase();
          const isPlayerPiece =
            (playerColor === 'white' && isWhitePiece) || (playerColor === 'black' && !isWhitePiece);
          if (isPlayerPiece) {
            selectedSquare = squareName;
            legalMoves = await getLegalMovesForSquare(squareName);
            return;
          }
        }
        selectedSquare = null;
        legalMoves = [];
      }
    }
  }
</script>

<div class="board-wrapper" class:flipped={playerColor === 'black'}>
  <div class="board">
    {#each getRanksForColor() as rank}
      {#each getFilesForColor() as file}
        {@const squareName = getSquareName(file, rank)}
        {@const board = parseBoard()}
        {@const piece = board[rank][file]}
        {@const isLight = (file + rank) % 2 === 0}
        {@const isSelected = selectedSquare === squareName}
        {@const isLegal = legalMoves.includes(squareName)}
        {@const isHovered = hoveredSquare === squareName}
        <div
          class="square {isLight ? 'light' : 'dark'} {isSelected ? 'selected' : ''} {isLegal ? 'legal-target' : ''} {isHovered && !isSelected ? 'hovered' : ''}"
          role="button"
          tabindex="0"
          aria-label="{squareName}{piece ? ' ' + piece : ''}"
          onclick={() => handleSquareClick(file, rank)}
          onkeydown={(e) => e.key === 'Enter' && handleSquareClick(file, rank)}
          onmouseenter={() => (hoveredSquare = squareName)}
          onmouseleave={() => (hoveredSquare = null)}
        >
          {#if piece}
            <span
              class="piece {isMyTurn && ((playerColor === 'white' && piece === piece.toUpperCase()) || (playerColor === 'black' && piece !== piece.toUpperCase())) ? 'my-piece' : ''}"
              aria-hidden="true"
            >
              {pieceToUnicode(piece)}
            </span>
          {/if}
          {#if isLegal && !piece}
            <span class="legal-dot" aria-hidden="true"></span>
          {/if}
          {#if isLegal && piece}
            <span class="legal-capture" aria-hidden="true"></span>
          {/if}
        </div>
      {/each}
    {/each}
  </div>

  <!-- File coordinates -->
  <div class="coords-bottom" aria-hidden="true">
    {#each getFilesForColor() as file}
      <span>{'abcdefgh'[file]}</span>
    {/each}
  </div>

  <!-- Rank coordinates -->
  <div class="coords-left" aria-hidden="true">
    {#each getRanksForColor() as rank}
      <span>{rank + 1}</span>
    {/each}
  </div>
</div>

<style>
  .board-wrapper {
    position: relative;
    display: inline-block;
    user-select: none;
  }

  .board {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    grid-template-rows: repeat(8, 1fr);
    width: clamp(280px, 60vmin, 560px);
    height: clamp(280px, 60vmin, 560px);
    border: 2px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    box-shadow: var(--shadow);
  }

  .square {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    transition: background-color var(--transition-hover);
  }

  .square.light {
    background-color: var(--board-light);
  }

  .square.dark {
    background-color: var(--board-dark);
  }

  .square.light:hover {
    background-color: var(--board-light-hover);
  }

  .square.dark:hover {
    background-color: var(--board-dark-hover);
  }

  .square.hovered.light {
    background-color: var(--board-light-hover);
  }

  .square.hovered.dark {
    background-color: var(--board-dark-hover);
  }

  .square.selected.light {
    background-color: var(--board-light-selected);
  }

  .square.selected.dark {
    background-color: var(--board-dark-selected);
  }

  .square.legal-target.light {
    background-color: var(--board-light-legal);
  }

  .square.legal-target.dark {
    background-color: var(--board-dark-legal);
  }

  .piece {
    font-size: clamp(1.5rem, 5vmin, 3rem);
    line-height: 1;
    display: block;
    transition: transform var(--transition-move);
    pointer-events: none;
    filter: drop-shadow(1px 1px 2px rgba(0, 0, 0, 0.4));
  }

  .piece.my-piece:hover {
    transform: scale(var(--piece-hover-scale));
    cursor: grab;
  }

  .legal-dot {
    position: absolute;
    width: 28%;
    height: 28%;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.2);
    pointer-events: none;
  }

  .legal-capture {
    position: absolute;
    inset: 0;
    border: 4px solid rgba(0, 0, 0, 0.2);
    border-radius: 50%;
    pointer-events: none;
  }

  .coords-bottom {
    display: flex;
    padding-left: 0;
  }

  .coords-bottom span,
  .coords-left span {
    font-size: 0.7rem;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .coords-bottom {
    width: clamp(280px, 60vmin, 560px);
    justify-content: space-around;
    margin-top: 4px;
  }

  .coords-left {
    position: absolute;
    left: -18px;
    top: 0;
    height: clamp(280px, 60vmin, 560px);
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    align-items: center;
  }
</style>
