
Feature: Chess application visual theme
    As a user
    I want the application to have a polished dark and white appearance
    So that the game feels clean, modern, and readable

    Scenario: Render the application with a cohesive dark and white theme
        When a user opens the application
        Then the interface uses a cohesive dark and white color palette
        And the board, panels, and controls share the same visual language

    Scenario: Keep the board readable in the chosen theme
        When a game board is displayed
        Then light and dark squares are visually distinct
        And pieces remain easy to distinguish from the board background
        And coordinates, controls, and status text remain readable

    Scenario: Keep hover states and selected states visible in the theme
        Given the board is displayed
        When a user hovers or selects an interactive element
        Then the resulting visual state has sufficient contrast against the surrounding UI
        And the user can tell the difference between default, hovered, and selected states

    Scenario: Keep chat and game panels consistent with the main theme
        When the chat panel and game information panel are shown
        Then they use the same dark and white design system as the rest of the application
        And text, borders, and inputs remain legible
