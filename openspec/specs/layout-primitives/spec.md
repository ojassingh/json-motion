# layout-primitives Specification

## Purpose
Define semantic layout nodes that replace hand-computed pixel positioning for common composition patterns.

## Requirements

### Requirement: A `center` layout node centers its child within the parent or frame
The system SHALL support a `center` node type that accepts exactly one child node and positions it so its visual center coincides with the center of the containing parent (or the frame, if `center` is a root-level scene node). The `center` node SHALL accept optional `width` and `height` overrides; when omitted, it SHALL use the parent dimensions or the frame dimensions. The child's `x` and `y` SHALL be computed by the layout resolver, not specified by the AI.

#### Scenario: A rect centered in the frame
- **WHEN** a scene contains a `center` node at root level with a 160×160 `rect` child, and the frame is 960×540
- **THEN** the rect is rendered with its visual center at (480, 270)

#### Scenario: A center node inside a group
- **WHEN** a `center` node is a child of a `group` positioned at (100, 100) with width 400 and height 300
- **THEN** the child is centered within the group's bounds, not the frame

### Requirement: A `stack` layout node arranges children sequentially with automatic spacing
The system SHALL support a `stack` node type that accepts a `direction` prop (`"vertical"` or `"horizontal"`), a `gap` prop (non-negative number, pixels between children), and an optional `align` prop (`"start"`, `"center"`, `"end"`, defaulting to `"center"`). The stack SHALL compute each child's position along the stack axis based on the preceding children's dimensions plus the gap. Children's cross-axis positions SHALL be determined by the `align` prop.

#### Scenario: A vertical stack of three rectangles with gap
- **WHEN** a `stack` with `direction: "vertical"`, `gap: 16` contains three 100×50 rects
- **THEN** the rects are positioned at y offsets 0, 66 (50+16), and 132 (50+16+50+16) along the stack axis, and centered on the cross-axis

#### Scenario: A horizontal stack with end alignment
- **WHEN** a `stack` with `direction: "horizontal"`, `gap: 8`, `align: "end"` contains children of different heights
- **THEN** children are positioned left-to-right with 8px gaps, and their bottom edges are aligned

#### Scenario: A stack with a single child
- **WHEN** a `stack` contains only one child
- **THEN** the child is positioned at the stack origin according to the `align` prop, with no gap applied

### Requirement: An `align` layout node positions its child relative to a named anchor within the frame
The system SHALL support an `align` node type that accepts a `position` prop (one of the nine anchor values: `"top-left"`, `"top-center"`, `"top-right"`, `"center-left"`, `"center"`, `"center-right"`, `"bottom-left"`, `"bottom-center"`, `"bottom-right"`) and an optional `padding` prop (non-negative number, default 0). The node SHALL position its single child so the child's corresponding anchor point sits at the named position within the frame, inset by the padding value.

#### Scenario: A title aligned to top-center with padding
- **WHEN** an `align` node with `position: "top-center"` and `padding: 40` contains a text node
- **THEN** the text is positioned so its top-center point is at (frame_width/2, 40)

#### Scenario: An element aligned to bottom-right
- **WHEN** an `align` node with `position: "bottom-right"` and `padding: 24` contains a 200×100 rect
- **THEN** the rect's bottom-right corner is at (frame_width - 24, frame_height - 24)

### Requirement: Layout nodes compose with each other and with absolute-positioned nodes
Layout nodes SHALL be nestable: a `stack` inside a `center`, an `align` containing a `stack`, etc. Layout resolution SHALL run top-down, computing absolute positions for all layout-managed children before the animation/render pipeline processes them. Nodes with explicit `x`/`y` coordinates inside a layout node SHALL use those as offsets from the layout-computed position.

#### Scenario: A centered vertical stack
- **WHEN** a `center` node contains a `stack` with `direction: "vertical"` and three children
- **THEN** the entire stack is centered in the frame, and children within the stack are spaced according to the stack's `gap`

#### Scenario: Absolute offset inside a layout node
- **WHEN** a child inside a `stack` specifies `x: 10`
- **THEN** the child's final x position is the stack-computed x plus 10

### Requirement: Layout nodes support animations and primitives on themselves
Layout nodes SHALL support the same base `animate` and `primitives` properties as other nodes. Animations on a layout node SHALL affect all of its children as a group via the canvas transform stack. Layout-computed positions SHALL be calculated at the base non-animated state.

#### Scenario: A stack with BlurFadeIn
- **WHEN** a `stack` has `primitives: ["BlurFadeIn"]`
- **THEN** all children of the stack fade in together as a group with the blur effect
