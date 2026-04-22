
Feature: Real-time game state delivery through server-sent events
    As a connected client
    I want game state updates to arrive through SSE
    So that both players stay synchronised without polling

    Background:
        Given a game exists with two players

    Scenario: Subscribe to the game state stream
        When a player opens the game screen
        Then the client connects to the game's SSE endpoint
        And the client begins receiving game state events

    Scenario: Broadcast updated state after an accepted move
        Given both players are connected to the game's SSE stream
        When the server accepts a legal move
        Then the server emits an updated game state event
        And both players receive the same new board state
        And both players see the active turn updated

    Scenario: Broadcast game start to both players
        Given the host is waiting in a lobby
        When the second player joins
        Then the server emits a game started event through SSE
        And both players receive the initialized starting state

    Scenario: Broadcast game completion
        Given a move results in checkmate, stalemate, or a draw
        When the server records the result
        Then the server emits a terminal game state event
        And both players receive the final result
        And the clients stop allowing further moves

    Scenario: Rehydrate a reconnecting client from SSE-compatible state
        Given a player temporarily loses their connection
        And the game continues on the server
        When the player reconnects to the game screen
        Then the client reconnects to the SSE endpoint
        And the client receives the current authoritative game state

    Scenario: Do not emit a state change for a rejected move
        Given both players are connected to SSE
        When a move is rejected by the server
        Then the server does not emit a new board state event
        And clients keep showing the previous valid state
