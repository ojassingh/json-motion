import { XMLParser } from "fast-xml-parser";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import svgPath from "svgpath";

import type { VideoIconPrimitive } from "@/lib/types/video";

const DEFAULT_MATH_FONT_SIZE = 48;
const DEFAULT_EX_FACTOR = 0.5;
const DISPLAY_LATEX_PATTERN = /^\s*\$\$([\s\S]+)\$\$\s*$/;
const EX_UNIT_PATTERN = /^([0-9]*\.?[0-9]+)ex$/;
const VIEWBOX_SPLIT_PATTERN = /\s+/;
const XML_PARSER = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
});

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: ["base", "ams"],
});

const svgOutput = new SVG({
  fontCache: "none",
});

const html = mathjax.document("", {
  InputJax: tex,
  OutputJax: svgOutput,
});

interface ParsedViewBox {
  height: number;
  minX: number;
  minY: number;
  width: number;
}

interface LatexIconResult {
  elements: VideoIconPrimitive[];
  height: number;
  viewportHeight: number;
  viewportWidth: number;
  width: number;
}

type XmlElement = Record<string, unknown>;

function isXmlElement(value: unknown): value is XmlElement {
  return typeof value === "object" && value !== null;
}

function readStringAttribute(
  element: XmlElement,
  name: string
): string | undefined {
  const value = element[name];
  return typeof value === "string" ? value : undefined;
}

function readElementArray(element: XmlElement, name: string): XmlElement[] {
  const value = element[name];

  if (Array.isArray(value)) {
    return value.filter(isXmlElement);
  }

  if (isXmlElement(value)) {
    return [value];
  }

  return [];
}

function readExDimension(
  value: string | undefined,
  ex: number,
  name: string
): number {
  const match = value?.match(EX_UNIT_PATTERN);
  if (!match) {
    throw new Error(`MathJax SVG is missing a valid ${name} dimension.`);
  }

  return Number(match[1]) * ex;
}

function parseViewBox(value: string | undefined): ParsedViewBox {
  const parts = value?.split(VIEWBOX_SPLIT_PATTERN).map(Number);

  if (parts?.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error("MathJax SVG is missing a valid viewBox.");
  }

  const [minX, minY, width, height] = parts;

  return { height, minX, minY, width };
}

export function extractDisplayLatex(text: string): string | null {
  const match = text.match(DISPLAY_LATEX_PATTERN);
  const latex = match?.[1]?.trim();

  if (!latex) {
    return null;
  }

  return latex;
}

function collectPathPrimitives(
  element: XmlElement,
  inheritedTransform: string,
  elements: VideoIconPrimitive[]
): void {
  const currentTransform = readStringAttribute(element, "transform");
  const transform = [inheritedTransform, currentTransform]
    .filter(Boolean)
    .join(" ");

  for (const pathElement of readElementArray(element, "path")) {
    const d = readStringAttribute(pathElement, "d");

    if (!d) {
      continue;
    }

    const pathTransform = readStringAttribute(pathElement, "transform");
    const transformed = [transform, pathTransform].filter(Boolean).join(" ");
    const normalizedPath = transformed
      ? svgPath(d).transform(transformed).round(3).toString()
      : svgPath(d).round(3).toString();

    elements.push({
      d: normalizedPath,
      type: "path",
    });
  }

  for (const groupElement of readElementArray(element, "g")) {
    collectPathPrimitives(groupElement, transform, elements);
  }
}

export function latexToIcon(
  latex: string,
  options?: {
    fontSize?: number;
  }
): LatexIconResult {
  const fontSize = options?.fontSize ?? DEFAULT_MATH_FONT_SIZE;
  const ex = fontSize * DEFAULT_EX_FACTOR;
  const rendered = html.convert(latex, {
    containerWidth: 80 * fontSize,
    display: true,
    em: fontSize,
    ex,
  });
  const [svgElement] = adaptor.tags(rendered, "svg");

  if (!svgElement) {
    throw new Error("MathJax did not return an SVG element.");
  }

  const serializedSvg = adaptor.outerHTML(svgElement);
  const parsed: unknown = XML_PARSER.parse(serializedSvg);

  if (!isXmlElement(parsed)) {
    throw new Error("Failed to parse MathJax SVG output.");
  }

  const svg = parsed.svg;
  if (!isXmlElement(svg)) {
    throw new Error("Parsed MathJax SVG is missing the root svg element.");
  }

  const width = readExDimension(readStringAttribute(svg, "width"), ex, "width");
  const height = readExDimension(
    readStringAttribute(svg, "height"),
    ex,
    "height"
  );
  const viewBox = parseViewBox(readStringAttribute(svg, "viewBox"));
  const elements: VideoIconPrimitive[] = [];
  const normalizeTransform = `translate(${-viewBox.minX},${-viewBox.minY})`;

  collectPathPrimitives(svg, normalizeTransform, elements);

  if (elements.length === 0) {
    throw new Error("MathJax SVG did not contain any path data.");
  }

  return {
    elements,
    height,
    viewportHeight: viewBox.height,
    viewportWidth: viewBox.width,
    width,
  };
}
