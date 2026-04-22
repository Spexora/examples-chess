
Feature: Chess rules and game outcomes
    As a player
    I want chess rules to be enforced consistently
    So that every game is fair and valid

    Background:
        Given a new chess game has started
        And White moves first

    Scenario: Alternate turns between White and Black
        Given it is White's turn
        When White makes a legal move
        Then the move is accepted
        And it becomes Black's turn

    Scenario: Reject a move when it is not the player's turn
        Given it is White's turn
        When Black attempts to make a move
        Then the move is rejected
        And the board state remains unchanged
        And it is still White's turn

    Scenario: Allow legal piece movement
        Given the board is arranged so that a <piece> can move legally from <from> to <to>
        When the current player moves the <piece> from <from> to <to>
        Then the move is accepted
        And the piece is placed on <to>

        Examples:
            | piece  | from | to |
            | pawn   | e2   | e4 |
            | knight | g1   | f3 |
            | bishop | f1   | c4 |
            | rook   | a1   | a3 |
            | queen  | d1   | h5 |
            | king   | e1   | e2 |

    Scenario: Capture an opponent piece legally
        Given a White bishop can legally capture a Black piece on b5
        When White moves the bishop to b5
        Then the move is accepted
        And the black piece on b5 is removed from the board

    Scenario: Reject an illegal movement pattern
        Given a bishop is on c1
        When the player attempts to move the bishop from c1 to c2
        Then the move is rejected
        And the board state remains unchanged
    
    Scenario: Reject a move that passes through blocking pieces
        Given a rook is on a1
        And another piece blocks the rook's path on a2
        When the player attempts to move the rook from a1 to a4
        Then the move is rejected
        And the board state remains unchanged

    Scenario: Reject a move that leaves the player's king in check
        Given the current player is not in check
        And moving a pinned piece would expose that player's king to attack
        When the current player attempts that move
        Then the move is rejected
        And the board state remains unchanged

    Scenario: Detect check
        Given Black's king is attacked by a legal White move
        When White completes that move
        Then the move is accepted
        And Black is marked as being in check

    Scenario: Detect checkmate and end the game
        Given Black is in check
        And Black has no legal moves
        When the checking move is completed
        Then the game result is checkmate
        And White is declared the winner
        And no further moves are accepted

    Scenario: Detect stalemate and end the game as a draw
        Given the current player is not in check
        And the current player has no legal moves
        When the last legal move is completed
        Then the game result is stalemate
        And the game is declared a draw
        And no further moves are accepted

    Scenario: Allow castling when all castling conditions are satisfied
        Given the king and rook involved have not moved
        And all squares between them are empty
        And the king is not in check
        And the king does not pass through or land on an attacked square
        When the player castles king side
        Then the move is accepted
        And the king and rook are placed on their castled squares

    Scenario: Reject castling through check
        Given the king and rook involved have not moved
        And an intermediate square is under attack
        When the player attempts to castle
        Then the move is rejected
        And the board state remains unchanged

    Scenario: Allow en passant immediately after an eligible pawn advance
        Given Black has just moved a pawn two squares forward next to a White pawn
        And White can capture that pawn en passant
        When White performs the en passant capture on the next move
        Then the move is accepted
        And the moved Black pawn is removed from the board

    Scenario: Reject en passant after the immediate response window has passed
        Given an en passant capture was available on the previous turn
        And another move has been played since then
        When the player attempts the en passant capture
        Then the move is rejected
        And the board state remains unchanged

    Scenario Outline: Promote a pawn that reaches the final rank
        Given a pawn can legally move to the final rank
        When the player promotes the pawn to a <piece>
        Then the move is accepted
        And the pawn is replaced by a <piece>

        Examples:
            | piece  |
            | queen  |
            | rook   |
            | bishop |
            | knight |

    Scenario: Draw by insufficient material
        Given the board contains only kings
        When the game state is evaluated
        Then the game result is a draw by insufficient material

    Scenario: Draw by threefold repetition
        Given the same legal board position with the same side to move has occurred three times
        When the game state is evaluated
        Then the game result is a draw by repetition

    Scenario: Draw by the fifty-move rule
        Given fifty consecutive moves by each side have occurred without a pawn move or capture
        When the game state is evaluated
        Then the game result is a draw by the fifty-move rule
