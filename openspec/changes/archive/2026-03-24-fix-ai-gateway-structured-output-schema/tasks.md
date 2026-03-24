## 1. Provider-compatible schema

- [x] 1.1 Replace tuple-style `scenes` and `keyframes` definitions in the
  shared video types and Zod schema with plain arrays that preserve the same
  minimum-length validation rules.

## 2. Regression coverage

- [x] 2.1 Add targeted tests that verify the serialized JSON Schema avoids
  tuple-style `prefixItems` for the provider-facing scene contract.
- [x] 2.2 Add or update tests around prompt generation so the Gateway failure
  case is covered by the new schema shape instead of only mocked happy paths.

## 3. Verification

- [x] 3.1 Run targeted Bun tests and `bun x ultracite check`, then fix any
  issues found.
