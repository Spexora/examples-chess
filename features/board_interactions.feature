
Feature: Board interactions, hover effects, and movement animations
    As a player
    I want the board to feel responsive and polished
    So that moving pieces is clear and enjoyable

    Background:
        Given a player is viewing an active chess game

    Scenario: Show a hover effect when the cursor is over a board square
        When the player hovers over a square on the board
        Then that square shows a visible hover effect
        And the effect fits the active theme

    Scenario: Show a hover effect when the cursor is over one of the player's pieces
        Given one of the current player's pieces is on the board
        When the player hovers over that piece
        Then the piece shows a visible hover effect
        And the effect distinguishes it from non-hovered pieces

    Scenario: Highlight selectable legal destinations for a chosen piece
        Given it is the current player's turn
        When the player selects one of their movable pieces
        Then the board highlights the legal destination squares for that piece

    Scenario: Animate a piece moving after a server-accepted move
        Given a move has been accepted by the server
        When the updated game state reaches the client
        Then the piece transitions smoothly from the source square to the destination square
        And the board ends in the final server-provided state

    Scenario: Animate a capture clearly
        Given a move captures an opponent piece
        When the move is rendered on the client
        Then the capturing piece animates to the destination square
        And the captured piece is removed cleanly from the board

    Scenario: Do not animate an unaccepted move as final state
        Given a player attempts a move locally
        When the server rejects that move
        Then the client does not commit a final move animation for the rejected move
        And the piece remains in its last accepted position
