
Feature: Lobby creation, color selection, invite flow and game start
    As a player creating a game
    I want to choose my starting color and invite an opponent
    So that the match begins when both players are present

    Scenario: Host creates a game and chooses White
        Given a visitor opens the new game flow
        When the visitor chooses to host a game as White
        Then a new lobby is created
        And the host is assigned the White side
        And an invite link is shown to the host
        And the game is waiting for an opponent

    Scenario: Host creates a game and chooses Black
        Given a visitor opens the new game flow
        When the visitor chooses to host a game as Black
        Then a new lobby is created
        And the host is assigned the Black side
        And an invite link is shown to the host
        And the game is waiting for an opponent

    Scenario: Second player joins from the invite link
        Given a host has created a lobby
        And the host has chosen to play as White
        When a second user opens the invite link
        Then the second user joins the same lobby
        And the second user is assigned the Black side

    Scenario: Game starts automatically when the second player joins
        Given a host is waiting in a lobby
        When the second user joins that lobby
        Then the lobby status changes to in-progress
        And the chessboard is initialized in the standard starting position
        And the game starts immediately

    Scenario: Prevent a third user from joining an active two-player game
        Given a lobby already contains two players
        When a third user opens the invite link
        Then the third user is not allowed to join the game
        And the user sees that the game is full or unavailable

    Scenario: Re-open an existing invite before the opponent joins
        Given a host has created a lobby and copied the invite link
        When the host re-opens the invite link before anyone joins
        Then the host returns to the same waiting lobby
        And the previously selected side is preserved
    
    Scenario: Show waiting state until an opponent joins
        Given a host has created a lobby
        And no opponent has joined yet
        When the host views the lobby
        Then the host sees a waiting state
        And the invite link remains visible
        And the chessboard does not allow active play yet
