## Why

The current prompt-to-video page proves the end-to-end render flow, but it does
not explain progress well while a request is running and the layout still looks
like a generic internal tool. We need a clearer product-facing playground now
so users can understand the AI-to-JSON-to-video workflow, see generated JSON as
soon as planning finishes, and watch render progress frame by frame.

## What Changes

- Redesign the home playground to use a more deliberate landing-page layout with
  a compact top nav, stronger hero messaging, fewer navigation items, and a
  side-by-side JSON and live preview workspace.
- Replace the default filled prompt with an empty input and a row of example
  prompt buttons that seed common animation ideas such as rotating shapes and
  fade-ins.
- Replace the current one-line waiting state with a clearer loading panel that
  explains the AI-to-video flow while the existing blocking request runs.
- Keep the server API unchanged so the implementation stays minimal and easy to
  read.

## Capabilities

### New Capabilities
- `prompt-to-video-playground-ui`: Present the prompt-to-video experience as a
  polished playground with curated prompt starters, a cleaner loading state,
  and a clearer split between generated structure and rendered output.

### Modified Capabilities
- None.

## Impact

- Affected code will include the main prompt-to-video page, related UI
  components, and focused test updates around the revised prompt UX.
- The change avoids new render-job tracking or polling infrastructure.
