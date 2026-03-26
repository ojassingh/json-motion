import type {
  ResolvedFrame,
  ResolvedVideoNode,
  VideoColor,
  VideoDescription,
  VideoEasingName,
  VideoNode,
  VideoScene,
  VideoTimelineEvent,
} from "@/lib/types/video";
import { lerpOklch } from "@/lib/video/color";
import {
  DEFAULT_SCENE_BACKGROUND,
  DEFAULT_TEXT_COLOR,
  DEFAULT_TEXT_FONT_FAMILY,
  DEFAULT_TEXT_FONT_SIZE,
  DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER,
} from "@/lib/video/config";
import { resolveLayout } from "@/lib/video/layout";
import { resolveMathDimensions } from "@/lib/video/math";
import type { PreRenderCaches } from "@/lib/video/pre-render";
import {
  createEmptyResolvedFrame,
  getSceneForFrame,
  getSceneLocalFrame,
} from "@/lib/video/timeline";

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

const ease = (p: number, name: VideoEasingName): number => {
  if (name === "ease-in") {
    return p * p;
  }
  if (name === "ease-out") {
    return 1 - (1 - p) * (1 - p);
  }
  if (name === "ease-in-out") {
    return p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
  }
  if (name === "ease-in-expo") {
    return p === 0 ? 0 : 2 ** (10 * p - 10);
  }
  if (name === "ease-out-expo") {
    return p === 1 ? 1 : 1 - 2 ** (-10 * p);
  }
  if (name === "ease-in-back") {
    const c = 1.701_58;
    return (c + 1) * p ** 3 - c * p ** 2;
  }
  if (name === "ease-out-back") {
    const c = 1.701_58;
    const q = p - 1;
    return 1 + (c + 1) * q ** 3 + c * q ** 2;
  }
  if (name === "spring") {
    return 1 - Math.exp(-6 * p) * Math.cos(p * 10);
  }
  return p;
};

// ---------------------------------------------------------------------------
// Segments
// ---------------------------------------------------------------------------

interface NumSeg {
  easing: VideoEasingName;
  end: number;
  from: number;
  start: number;
  to: number;
}

interface ColorSeg {
  easing: VideoEasingName;
  end: number;
  from: string;
  start: number;
  to: string;
}

const buildNumSegs = (
  events: VideoTimelineEvent[],
  prop: string,
  base: number
): NumSeg[] => {
  const segs: NumSeg[] = [];
  let last = base;

  for (const ev of events) {
    const val = (ev as Record<string, unknown>)[prop] as number | undefined;
    if (val === undefined) {
      continue;
    }
    const dur = ev.dur ?? 0;
    segs.push({
      easing: ev.ease ?? "ease-out",
      end: ev.at + dur,
      from: last,
      start: ev.at,
      to: val,
    });
    last = val;
  }

  return segs;
};

const buildColorSegs = (
  events: VideoTimelineEvent[],
  prop: string,
  base: string | undefined
): ColorSeg[] => {
  const segs: ColorSeg[] = [];
  let last = base;

  for (const ev of events) {
    const val = (ev as Record<string, unknown>)[prop] as string | undefined;
    if (val === undefined) {
      continue;
    }
    if (!last) {
      last = val;
      continue;
    }
    const dur = ev.dur ?? 0;
    segs.push({
      easing: ev.ease ?? "ease-out",
      end: ev.at + dur,
      from: last,
      start: ev.at,
      to: val,
    });
    last = val;
  }

  return segs;
};

const resolveNum = (segs: NumSeg[], base: number, t: number): number => {
  let val = base;
  for (const s of segs) {
    if (t < s.start) {
      return val;
    }
    if (t >= s.end || s.start === s.end) {
      val = s.to;
      continue;
    }
    const raw = (t - s.start) / (s.end - s.start);
    return s.from + (s.to - s.from) * ease(Math.min(raw, 1), s.easing);
  }
  return val;
};

const resolveColor = (
  segs: ColorSeg[],
  base: string | undefined,
  t: number
): string | undefined => {
  let val = base;
  for (const s of segs) {
    if (t < s.start) {
      return val;
    }
    if (t >= s.end || s.start === s.end) {
      val = s.to;
      continue;
    }
    const raw = (t - s.start) / (s.end - s.start);
    return lerpOklch(s.from, s.to, ease(Math.min(raw, 1), s.easing));
  }
  return val;
};

// ---------------------------------------------------------------------------
// Node base values
// ---------------------------------------------------------------------------

const DEFAULT_GRAPH_COLOR = "#f8fafc";
const DEFAULT_MATH_COLOR = "#f8fafc";

const getStrokeWidthBase = (node: VideoNode): number => {
  if (node.type === "rect") {
    return node.strokeWidth ?? 0;
  }
  if (node.type === "functionGraph" || node.type === "parametricGraph") {
    return node.strokeWidth ?? 2;
  }
  return 0;
};

const isGraphNode = (
  node: VideoNode
): node is Extract<VideoNode, { type: "functionGraph" | "parametricGraph" }> =>
  node.type === "functionGraph" || node.type === "parametricGraph";

const buildNumLookup = (node: VideoNode): Record<string, number> => {
  const uniform = node.scale ?? 1;
  return {
    cornerRadius: node.type === "rect" ? (node.cornerRadius ?? 0) : 0,
    drawProgress: isGraphNode(node) ? (node.drawProgress ?? 1) : 1,
    dx: 0,
    dy: 0,
    fontSize: node.type === "text" ? (node.size ?? DEFAULT_TEXT_FONT_SIZE) : 0,
    height: "height" in node ? (node.height as number) : 0,
    opacity: node.opacity ?? 1,
    rotation: node.rotate ?? 0,
    scaleX: node.scaleX ?? uniform,
    scaleY: node.scaleY ?? uniform,
    skewX: node.skewX ?? 0,
    skewY: node.skewY ?? 0,
    strokeWidth: getStrokeWidthBase(node),
    width: "width" in node ? (node.width as number) : 0,
    x: 0,
    y: 0,
  };
};

const numBase = (node: VideoNode, prop: string): number =>
  buildNumLookup(node)[prop] ?? 0;

const colorBase = (node: VideoNode, prop: string): string | undefined => {
  if (prop === "fill" && node.type === "rect") {
    return node.fill;
  }
  if (prop === "stroke" && node.type === "rect") {
    return node.stroke;
  }
  if (prop === "color") {
    if (node.type === "text") {
      return node.color ?? DEFAULT_TEXT_COLOR;
    }
    if (
      node.type === "math" ||
      node.type === "functionGraph" ||
      node.type === "parametricGraph"
    ) {
      return node.color ?? DEFAULT_GRAPH_COLOR;
    }
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Collect + normalize events for a specific node
// ---------------------------------------------------------------------------

const getNodeEvents = (
  nodeId: string,
  timeline: VideoTimelineEvent[]
): VideoTimelineEvent[] => {
  const out: VideoTimelineEvent[] = [];

  for (const ev of timeline) {
    const targets = Array.isArray(ev.target) ? ev.target : [ev.target];
    if (!targets.includes(nodeId)) {
      continue;
    }

    let normalized = ev;

    if (ev.action === "draw" && ev.drawProgress === undefined) {
      normalized = { ...ev, drawProgress: 1 };
    }

    if (normalized.scale !== undefined) {
      normalized = {
        ...normalized,
        scaleX: normalized.scaleX ?? normalized.scale,
        scaleY: normalized.scaleY ?? normalized.scale,
      };
    }

    out.push(normalized);
  }

  return out.toSorted((a, b) => a.at - b.at);
};

// ---------------------------------------------------------------------------
// Resolve a single node at a given time
// ---------------------------------------------------------------------------

const resolveNode = (
  id: string,
  node: VideoNode,
  layoutPos: { x: number; y: number },
  events: VideoTimelineEvent[],
  t: number,
  sourceIndex: number,
  caches?: PreRenderCaches
): ResolvedVideoNode => {
  const n = (evProp: string, baseProp: string, baseOverride?: number) => {
    const base = baseOverride ?? numBase(node, baseProp);
    return resolveNum(buildNumSegs(events, evProp, base), base, t);
  };
  const c = (prop: string) => {
    const base = colorBase(node, prop);
    return resolveColor(buildColorSegs(events, prop, base), base, t);
  };

  const xPos = resolveNum(
    buildNumSegs(events, "x", layoutPos.x),
    layoutPos.x,
    t
  );
  const yPos = resolveNum(
    buildNumSegs(events, "y", layoutPos.y),
    layoutPos.y,
    t
  );
  const dx = resolveNum(buildNumSegs(events, "dx", 0), 0, t);
  const dy = resolveNum(buildNumSegs(events, "dy", 0), 0, t);

  const base = {
    blur: 0,
    id,
    opacity: n("opacity", "opacity"),
    rotation: n("rotate", "rotation"),
    scaleX: n("scaleX", "scaleX"),
    scaleY: n("scaleY", "scaleY"),
    skewX: n("skewX", "skewX"),
    skewY: n("skewY", "skewY"),
    sourceIndex,
    x: xPos + dx,
    y: yPos + dy,
    zIndex: node.zIndex ?? 0,
  };

  if (node.type === "rect") {
    return {
      ...base,
      fill: c("fill") as VideoColor | undefined,
      height: n("height", "height"),
      radius: n("cornerRadius", "cornerRadius"),
      stroke: c("stroke") as VideoColor | undefined,
      strokeWidth: n("strokeWidth", "strokeWidth"),
      type: "rect",
      width: n("width", "width"),
    };
  }

  if (node.type === "text") {
    const fontSize = n("size", "fontSize");
    return {
      ...base,
      color: (c("color") ?? DEFAULT_TEXT_COLOR) as VideoColor,
      fontFamily: node.fontFamily ?? DEFAULT_TEXT_FONT_FAMILY,
      fontSize,
      fontWeight: node.fontWeight ?? 600,
      lineHeight:
        node.lineHeight ?? fontSize * DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER,
      maxWidth: node.maxWidth,
      text: node.text,
      textAlign: node.textAlign ?? "left",
      type: "text",
    };
  }

  if (node.type === "image") {
    return {
      ...base,
      fit: node.fit ?? "cover",
      height: n("height", "height"),
      src: node.src,
      type: "image",
      width: n("width", "width"),
    };
  }

  if (node.type === "math") {
    const dims = resolveMathDimensions(node, caches?.mathImages);
    return {
      ...base,
      color: (c("color") ?? DEFAULT_MATH_COLOR) as VideoColor,
      fontSize: node.fontSize,
      height: dims.height,
      latex: node.latex,
      type: "math",
      width: dims.width,
    };
  }

  if (node.type === "functionGraph") {
    return {
      ...base,
      color: (c("color") ?? DEFAULT_GRAPH_COLOR) as VideoColor,
      drawProgress: n("drawProgress", "drawProgress"),
      height: node.height,
      showAxes: node.showAxes ?? false,
      showGrid: node.showGrid ?? false,
      strokeWidth: n("strokeWidth", "strokeWidth"),
      type: "functionGraph",
      width: node.width,
      xRange: node.xRange,
      yRange: node.yRange,
    };
  }

  return {
    ...base,
    color: (c("color") ?? DEFAULT_GRAPH_COLOR) as VideoColor,
    drawProgress: n("drawProgress", "drawProgress"),
    height: node.height,
    strokeWidth: n("strokeWidth", "strokeWidth"),
    type: "parametricGraph",
    width: node.width,
  };
};

// ---------------------------------------------------------------------------
// Resolve an entire frame
// ---------------------------------------------------------------------------

const resolveSceneBackground = (
  desc: VideoDescription,
  scene: VideoScene
): VideoColor =>
  scene.background ?? desc.background ?? DEFAULT_SCENE_BACKGROUND;

export const resolveFrame = (
  videoDescription: VideoDescription,
  absoluteFrame: number,
  caches?: PreRenderCaches
): ResolvedFrame => {
  const scene = getSceneForFrame(videoDescription, absoluteFrame);

  if (!scene) {
    return createEmptyResolvedFrame(videoDescription, absoluteFrame);
  }

  const localFrame = getSceneLocalFrame(scene, absoluteFrame);
  const t = localFrame / videoDescription.fps;
  const layout = resolveLayout(
    scene.nodes,
    videoDescription.width,
    videoDescription.height,
    caches
  );
  const timeline = scene.timeline ?? [];

  const nodes: ResolvedVideoNode[] = [];
  let sourceIndex = 0;

  for (const [id, node] of Object.entries(scene.nodes)) {
    const pos = layout.get(id) ?? { x: 0, y: 0 };
    const events = getNodeEvents(id, timeline);
    nodes.push(resolveNode(id, node, pos, events, t, sourceIndex, caches));
    sourceIndex++;
  }

  nodes.sort((a, b) => {
    const diff = a.zIndex - b.zIndex;
    return diff === 0 ? a.sourceIndex - b.sourceIndex : diff;
  });

  return {
    absoluteFrame,
    background: resolveSceneBackground(videoDescription, scene),
    localFrame,
    nodes,
    scene,
  };
};
