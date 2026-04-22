
Feature: Move submission through API and server-side validation
    As a client application
    I want moves to be submitted to the server by API
    So that the server remains the source of truth for legal play

    Background:
        Given a game exists with two connected players
        And the current board state is known to the server

    Scenario: Submit a legal move successfully
        When the active player submits a legal move through the move API
        Then the server responds that the move is accepted
        And the server persists the updated board state

    Scenario: Reject an illegal move through the move API
        When the active player submits an illegal move through the move API
        Then the server responds that the move is rejected
        And the server explains the rejection reason
        And the server does not change the board state
    
    Scenario: Reject a move from a player who is not part of the game
        Given a third user is not a participant in the game
        When that user submits a move through the move API
        Then the server responds with an authorization error
        And the board state remains unchanged

    Scenario: Reject a move after the game has ended
        Given the game result has already been recorded
        When either player submits another move through the move API
        Then the server responds that the game is finished
        And the board state remains unchanged

    Scenario: Reject stale client moves when the game state has advanced
        Given a client is viewing an out-of-date board state
        And another valid move has already been accepted by the server
        When the stale client submits a move based on the old position
        Then the server rejects the move as out of date or invalid
        And the client must refresh from server state

    Scenario: Include promotion choice when a pawn reaches the final rank
        Given a pawn move requires promotion
        When the player submits the move with a selected promotion piece through the move API
        Then the server validates the promotion choice
        And the server applies the promoted piece to the new board state
