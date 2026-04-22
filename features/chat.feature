
Feature: In-game chat between opponents
    As a player
    I want to exchange messages with my opponent
    So that we can communicate during the game

    Background:
        Given a game exists with two players

    Scenario: Opponents can send chat messages during an active game
        Given both players are viewing the game screen
        When one player sends a chat message
        Then the message is stored for that game
        And both players see the message in the chat panel

    Scenario: Preserve message order within a game
        Given several chat messages have been sent in the same game
        When either player views the chat panel
        Then the messages are shown in the order they were sent

    Scenario: Limit chat visibility to the two players in the game
        Given a chat message exists for a game
        When a user who is not one of the two players attempts to access the chat
        Then that user is denied access to the chat history and new messages

    Scenario: Distinguish messages by sender
        Given both players have sent messages
        When the chat is displayed
        Then each message clearly shows which player sent it

    Scenario: Keep chat available after the game starts
        Given the second player has joined and the game is in progress
        When either player opens the game screen
        Then the chat panel is available alongside the board
