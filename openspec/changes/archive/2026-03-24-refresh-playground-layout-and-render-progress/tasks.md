## 1. Shared contracts and dependencies

- [x] 1.1 Keep the existing prompt-to-video request and response contracts
  unchanged so the implementation stays UI-only.

## 2. Playground layout

- [x] 2.1 Replace the current page shell with a product-style playground layout
  that includes only Playground, Examples, GitHub, and theme toggle controls in
  the top navigation.
- [x] 2.2 Change the composer to start empty and add clickable starter prompt
  actions for common motion ideas such as square rotation, fade-in, and title
  reveal prompts.

## 3. Loading and result states

- [x] 3.1 Replace the current loading state with a clearer preview-panel spinner
  and explanatory copy for the existing blocking request flow.
- [x] 3.2 Keep the generated JSON and final video result views readable within
  the new workspace layout.

## 4. Verification

- [x] 4.1 Update focused tests where needed for the revised prompt defaults and
  UI copy without changing the server contract.
- [x] 4.2 Run `bun x ultracite check` and `bun test`, then fix any issues before
  implementation is considered complete.
