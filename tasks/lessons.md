# Lessons

- When the user asks for "a bunch of small strategic commits", do not bundle remaining branch changes into a single catch-all commit for convenience. Preserve the requested granularity, even for follow-up pushes.
- For layout bugs, inspect the full parent height chain and compare against any working sibling implementation before changing child sizing classes. Overflow and `flex-1` only work when an ancestor provides a bounded height.
- When the user provides compiled scene JSON, do not conflate it with the raw AI authoring format. Keep architecture recommendations grounded in the actual authoring-to-runtime boundaries that already exist.
- For hardware verification harnesses, do not use optimistic worker counts or implicit cloud resources. Match parallelism to the target GPU's actual encoder units, pin CPU and memory explicitly, and label same-host backend comparisons so they are not mistaken for the full baseline story.
- When the project has a single concrete deployment target, prefer one explicit invariant over a configurable policy layer. Use the smallest check that enforces the target requirement instead of building a generalized selection framework first.
- When the user’s performance goal is a remote target like Modal, do not close the loop with local benchmark numbers alone. Run the remote harness and label local results as local until the cloud numbers are in.
