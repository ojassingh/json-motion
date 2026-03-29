import { describe, expect, test } from "bun:test";

import { extractDisplayLatex, latexToIcon } from "./latex";

describe("extractDisplayLatex", () => {
  test("returns latex when text is wrapped in display math delimiters", () => {
    expect(extractDisplayLatex("$$x^2 + y^2 = z^2$$")).toBe("x^2 + y^2 = z^2");
  });

  test("returns null for plain text", () => {
    expect(extractDisplayLatex("hello world")).toBeNull();
  });
});

describe("latexToIcon", () => {
  test("renders latex into path primitives with dimensions", () => {
    const result = latexToIcon("\\frac{a}{b}");

    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.elements[0]?.type).toBe("path");
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  test("returns viewport dimensions from the mathjax viewbox", () => {
    const result = latexToIcon("x^2");

    expect(result.viewportWidth).toBeGreaterThan(0);
    expect(result.viewportHeight).toBeGreaterThan(0);
  });
});
