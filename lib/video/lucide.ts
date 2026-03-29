import type { IconNode } from "lucide-react";
import dynamicIconImports from "lucide-react/dynamicIconImports";

import type {
  VideoAiIconNode,
  VideoAiNode,
  VideoIconNode,
  VideoIconPrimitive,
  VideoNode,
  VideoTextNode,
} from "@/lib/types/video";
import { extractDisplayLatex, latexToIcon } from "@/lib/video/latex";

type IconAttributes = Record<string, string | number>;

// Matches the icon file stem inside the lazy import expression.
// Handles both .ts (source) and .js (dist) extensions and single/double quotes.
const ICON_PATH_REGEX = /icons\/([^'"]+?)\.(?:ts|js)/;
const POINT_SPLIT_REGEX = /[\s,]+/;
const DEFAULT_TEXT_COLOR = "#f8fafc";

export type LucideIconName = keyof typeof dynamicIconImports;

export interface CreateVideoIconNodeOptions
  extends Omit<VideoIconNode, "elements" | "type"> {
  iconNode: IconNode;
}

export const lucideIconNames = Object.keys(
  dynamicIconImports
) as LucideIconName[];

const readFiniteNumber = (
  attrs: IconAttributes,
  key: string,
  tag: string
): number => {
  const parsed = Number(attrs[key]);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Lucide ${tag} is missing numeric "${key}".`);
  }
  return parsed;
};

const readOptionalFiniteNumber = (
  attrs: IconAttributes,
  key: string
): number | undefined => {
  const value = attrs[key];
  if (value == null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Lucide attribute "${key}" must be numeric.`);
  }
  return parsed;
};

const parsePoints = (points: string): [number, number][] => {
  const parts = points
    .trim()
    .split(POINT_SPLIT_REGEX)
    .filter(Boolean)
    .map((v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        throw new Error(`Lucide points entry "${v}" is not numeric.`);
      }
      return n;
    });

  if (parts.length < 4 || parts.length % 2 !== 0) {
    throw new Error("Lucide poly points must contain x/y pairs.");
  }

  const pairs: [number, number][] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const x = parts[i];
    const y = parts[i + 1];
    if (x == null || y == null) {
      throw new Error("Lucide poly points must contain x/y pairs.");
    }
    pairs.push([x, y]);
  }
  return pairs;
};

const normalizeIconNode = (iconNode: IconNode): VideoIconPrimitive[] =>
  iconNode.map(([tag, attrs]): VideoIconPrimitive => {
    const a = attrs as IconAttributes;
    switch (tag) {
      case "path":
        return { d: String(a.d ?? "").trim(), type: "path" };
      case "circle":
        return {
          cx: readFiniteNumber(a, "cx", tag),
          cy: readFiniteNumber(a, "cy", tag),
          r: readFiniteNumber(a, "r", tag),
          type: "circle",
        };
      case "line":
        return {
          type: "line",
          x1: readFiniteNumber(a, "x1", tag),
          x2: readFiniteNumber(a, "x2", tag),
          y1: readFiniteNumber(a, "y1", tag),
          y2: readFiniteNumber(a, "y2", tag),
        };
      case "polyline":
        return {
          points: parsePoints(String(a.points ?? "")),
          type: "polyline",
        };
      case "polygon":
        return {
          points: parsePoints(String(a.points ?? "")),
          type: "polygon",
        };
      case "rect":
        return {
          height: readFiniteNumber(a, "height", tag),
          rx: readOptionalFiniteNumber(a, "rx"),
          ry: readOptionalFiniteNumber(a, "ry"),
          type: "rect",
          width: readFiniteNumber(a, "width", tag),
          x: readOptionalFiniteNumber(a, "x"),
          y: readOptionalFiniteNumber(a, "y"),
        };
      default:
        throw new Error(`Unsupported Lucide element "${tag}".`);
    }
  });

// Spreads all options through unchanged; only elements and type are built here.
export const createVideoIconNode = ({
  iconNode,
  ...rest
}: CreateVideoIconNodeOptions): VideoIconNode => ({
  ...rest,
  elements: normalizeIconNode(iconNode),
  type: "icon",
});

// Stringify the lazy-import function to extract the actual file stem, which
// differs from the map key for aliased icons (e.g. "alarm-check" →
// "alarm-clock-check"). Falls back to the raw name when the pattern doesn't
// match (non-aliased canonical names).
const resolveIconModulePath = (name: LucideIconName): string => {
  const loader = dynamicIconImports[name];
  const match = loader?.toString().match(ICON_PATH_REGEX);
  const file = match?.[1] ?? name;
  return `lucide-react/dist/esm/icons/${file}.js`;
};

export const createLucideIconNode = async ({
  name,
  ...options
}: Omit<CreateVideoIconNodeOptions, "iconNode"> & {
  name: LucideIconName;
}): Promise<VideoIconNode> => {
  const mod = await import(resolveIconModulePath(name));
  return createVideoIconNode({
    ...options,
    iconNode: mod.__iconNode as IconNode,
  });
};

// ---------------------------------------------------------------------------
// AI scene resolution
// ---------------------------------------------------------------------------

const resolveAiIconNode = async (
  node: VideoAiIconNode
): Promise<VideoIconNode> => {
  const path = resolveIconModulePath(node.name as LucideIconName);
  const mod = await import(path).catch(() => {
    throw new Error(`Unknown Lucide icon "${node.name}".`);
  });
  // Explicitly map fields to exclude 'name', which is not part of VideoIconNode.
  return createVideoIconNode({
    fill: node.fill,
    height: node.height,
    iconNode: mod.__iconNode as IconNode,
    lineCap: node.lineCap,
    lineJoin: node.lineJoin,
    opacity: node.opacity,
    rotate: node.rotate,
    scale: node.scale,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    skewX: node.skewX,
    skewY: node.skewY,
    stroke: node.stroke,
    strokeWidth: node.strokeWidth,
    width: node.width,
    x: node.x,
    y: node.y,
    zIndex: node.zIndex,
  });
};

const resolveAiTextNode = (node: VideoTextNode): VideoNode => {
  const latex = extractDisplayLatex(node.text);

  if (!latex) {
    return node;
  }

  const icon = latexToIcon(latex, {
    fontSize: node.size,
  });

  const iconNode: VideoIconNode = {
    absoluteStrokeWidth: false,
    elements: icon.elements,
    fill: node.color ?? DEFAULT_TEXT_COLOR,
    height: icon.height,
    opacity: node.opacity,
    rotate: node.rotate,
    scale: node.scale,
    scaleX: node.scaleX,
    scaleY: node.scaleY,
    skewX: node.skewX,
    skewY: node.skewY,
    strokeWidth: 0,
    type: "icon",
    viewportHeight: icon.viewportHeight,
    viewportWidth: icon.viewportWidth,
    width: icon.width,
    x: node.x,
    y: node.y,
    zIndex: node.zIndex,
  };

  return iconNode;
};

// Converts the nodes map from an AI output scene (name-based icons) into a
// fully-resolved map ready for the Rust engine (elements-based icons).
export const resolveAiSceneNodes = async (
  nodes: Record<string, VideoAiNode>
): Promise<Record<string, VideoNode>> => {
  const entries = await Promise.all(
    Object.entries(nodes).map(
      async ([id, node]): Promise<[string, VideoNode]> => {
        if (node.type === "icon") {
          return [id, await resolveAiIconNode(node)];
        }

        if (node.type === "text") {
          return [id, resolveAiTextNode(node)];
        }

        return [id, node];
      }
    )
  );
  return Object.fromEntries(entries);
};
