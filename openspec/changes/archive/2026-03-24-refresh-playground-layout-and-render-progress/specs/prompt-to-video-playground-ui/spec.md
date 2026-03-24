## ADDED Requirements

### Requirement: The playground presents a focused prompt-to-video workspace
The prompt-to-video home page SHALL present a product-style playground layout
with a minimal top navigation, an empty prompt composer, and a curated set of
starter prompt actions that users can apply without typing from scratch.

#### Scenario: Empty-state playground loads with a focused navigation and prompt starters
- **WHEN** a user opens the home page before generating a video
- **THEN** the page shows only the top-level navigation items for Playground,
  Examples, GitHub, and theme toggle controls
- **AND** the prompt input starts empty rather than prefilled with a default
  request
- **AND** the page shows a visible set of starter prompt actions for common
  motion patterns such as fades, rotation, and title reveals

### Requirement: The playground separates planning and rendering feedback
The playground SHALL communicate prompt submission as distinct planning and
rendering ideas so users understand what the system is doing while the current
request is in flight.

#### Scenario: Loading state explains the blocking workflow
- **WHEN** a user submits a valid prompt and the prompt-to-video request is in
  flight
- **THEN** the page shows a dedicated loading state in the preview workspace
- **AND** the loading state explains that the system is generating scene JSON
  and rendering the clip before the final result appears
- **AND** the page avoids presenting fake frame progress that the server does
  not actually provide
