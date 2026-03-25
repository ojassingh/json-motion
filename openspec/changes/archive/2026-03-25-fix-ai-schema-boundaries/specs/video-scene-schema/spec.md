## MODIFIED Requirements

### Requirement: Math node width and height are optional in the engine schema
The system SHALL accept a `math` node where `width` and `height` are optional fields. When present, they serve as fallback layout hints when no pre-render cache is available. When absent, the resolved dimensions SHALL be computed from the pre-render cache and `fontSize`. All other math node fields remain unchanged.

#### Scenario: A math node without width and height passes engine schema validation
- **WHEN** a render request includes a `math` node with `latex`, `fontSize`, and `color` but no `width` or `height`
- **THEN** `videoDescriptionSchema` parses it successfully

#### Scenario: A math node with width and height still passes engine schema validation
- **WHEN** a render request includes a `math` node with `latex`, `fontSize`, `width: 400`, and `height: 80`
- **THEN** `videoDescriptionSchema` parses it successfully, maintaining backward compatibility
