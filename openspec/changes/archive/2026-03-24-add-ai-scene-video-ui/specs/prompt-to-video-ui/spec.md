## ADDED Requirements

### Requirement: The home page accepts a single prompt for video generation
The main application page SHALL provide a text prompt input and a submit action
that sends the latest prompt to the prompt-to-video API without requiring the
user to author raw scene JSON.

#### Scenario: A user submits a plain-language prompt
- **WHEN** a user enters a scene request in the prompt field and submits the
  form
- **THEN** the UI sends that prompt to the prompt-to-video endpoint

### Requirement: The UI shows an in-flight loading state while generation is running
While a prompt-to-video request is in progress, the UI SHALL present a loading
state that makes the request status visible and prevents accidental duplicate
submissions for the same in-flight request.

#### Scenario: The submit state becomes visibly pending
- **WHEN** the user submits a prompt and the API request has not completed yet
- **THEN** the UI disables the submit action and shows a loading indicator until
  the request resolves

### Requirement: Successful generations show the latest rendered result
When a prompt-to-video request succeeds, the UI SHALL display the latest
generated video preview and expose the generated scene description for
inspection in the same screen.

#### Scenario: A successful generation replaces the previous result
- **WHEN** a user submits a second prompt after a previous successful render
- **THEN** the UI replaces the previously displayed result with the newest video
  preview and generated scene data

### Requirement: Failed generations show an actionable error without persistence
When a prompt-to-video request fails, the UI SHALL show an error state on the
page and SHALL not require persisted history or background job recovery to let
the user try again.

#### Scenario: A failed request keeps the workflow recoverable
- **WHEN** the prompt-to-video endpoint returns an error response
- **THEN** the UI displays the failure message and leaves the page ready for the
  user to submit another prompt
