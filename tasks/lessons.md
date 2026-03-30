# Lessons

- When the user asks for "a bunch of small strategic commits", do not bundle remaining branch changes into a single catch-all commit for convenience. Preserve the requested granularity, even for follow-up pushes.
- For layout bugs, inspect the full parent height chain and compare against any working sibling implementation before changing child sizing classes. Overflow and `flex-1` only work when an ancestor provides a bounded height.
- When the user provides compiled scene JSON, do not conflate it with the raw AI authoring format. Keep architecture recommendations grounded in the actual authoring-to-runtime boundaries that already exist.
