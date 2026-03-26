import { Canvas, type CanvasRenderingContext2D, type Image } from "skia-canvas";

import { toAppError } from "@/lib/errors";
import type {
  ResolvedFunctionGraphNode,
  ResolvedImageNode,
  ResolvedMathNode,
  ResolvedParametricGraphNode,
  ResolvedRectNode,
  ResolvedTextNode,
  ResolvedVideoNode,
  VideoDescription,
} from "@/lib/types/video";
import { resolveFrame } from "@/lib/video/animation";
import { loadVideoImage } from "@/lib/video/assets";
import type { Point2D } from "@/lib/video/graph";
import { buildMathCacheKey } from "@/lib/video/math";
import type { PreRenderCaches } from "@/lib/video/pre-render";

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const getNodeDimensions = (
  node: ResolvedVideoNode,
  context: CanvasRenderingContext2D
): { height: number; width: number } => {
  if (
    node.type === "rect" ||
    node.type === "image" ||
    node.type === "math" ||
    node.type === "functionGraph" ||
    node.type === "parametricGraph"
  ) {
    return { height: node.height, width: node.width };
  }

  if (node.type === "text") {
    let width: number;
    if (node.maxWidth === undefined) {
      context.font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`;
      width = context.measureText(node.text).width;
    } else {
      width = node.maxWidth;
    }
    return {
      height: node.lineHeight * node.text.split("\n").length,
      width,
    };
  }

  return { height: 0, width: 0 };
};

const applyNodeTransform = (
  context: CanvasRenderingContext2D,
  node: ResolvedVideoNode
): void => {
  const { height, width } = getNodeDimensions(node, context);
  const cx = width / 2;
  const cy = height / 2;

  context.translate(node.x + cx, node.y + cy);
  context.rotate(degreesToRadians(node.rotation));
  context.scale(node.scaleX, node.scaleY);
  context.transform(
    1,
    Math.tan(degreesToRadians(node.skewY)),
    Math.tan(degreesToRadians(node.skewX)),
    1,
    0,
    0
  );
  context.translate(-cx, -cy);
  context.globalAlpha *= node.opacity;

  if (node.blur > 0) {
    context.filter = `blur(${node.blur}px)`;
  }
};

// ---------------------------------------------------------------------------
// Node-type drawing
// ---------------------------------------------------------------------------

const drawRoundedRect = (
  context: CanvasRenderingContext2D,
  node: ResolvedRectNode
): void => {
  context.beginPath();
  context.roundRect(0, 0, node.width, node.height, node.radius);

  if (node.fill) {
    context.fillStyle = node.fill;
    context.fill();
  }

  if (node.stroke && node.strokeWidth > 0) {
    context.lineWidth = node.strokeWidth;
    context.strokeStyle = node.stroke;
    context.stroke();
  }
};

const drawTextNode = (
  context: CanvasRenderingContext2D,
  node: ResolvedTextNode
): void => {
  context.fillStyle = node.color;
  context.font = `${node.fontWeight} ${node.fontSize}px ${node.fontFamily}`;
  context.textAlign = node.textAlign;
  context.textBaseline = "top";

  let drawX = 0;
  if (node.textAlign === "center") {
    drawX = (node.maxWidth ?? 0) / 2;
  } else if (node.textAlign === "right") {
    drawX = node.maxWidth ?? 0;
  }

  for (const [lineIndex, line] of node.text.split("\n").entries()) {
    context.fillText(line, drawX, lineIndex * node.lineHeight, node.maxWidth);
  }
};

const getImageDestinationRect = (
  image: Image,
  node: ResolvedImageNode
): {
  dh: number;
  dw: number;
  dx: number;
  dy: number;
  sh?: number;
  sw?: number;
  sx?: number;
  sy?: number;
} => {
  if (node.fit === "fill") {
    return { dh: node.height, dw: node.width, dx: 0, dy: 0 };
  }

  const wr = node.width / image.width;
  const hr = node.height / image.height;
  const scale = node.fit === "contain" ? Math.min(wr, hr) : Math.max(wr, hr);

  if (node.fit === "contain") {
    const dw = image.width * scale;
    const dh = image.height * scale;
    return {
      dh,
      dw,
      dx: (node.width - dw) / 2,
      dy: (node.height - dh) / 2,
    };
  }

  const sw = node.width / scale;
  const sh = node.height / scale;
  return {
    dh: node.height,
    dw: node.width,
    dx: 0,
    dy: 0,
    sh,
    sw,
    sx: (image.width - sw) / 2,
    sy: (image.height - sh) / 2,
  };
};

const drawImageNode = async (
  context: CanvasRenderingContext2D,
  node: ResolvedImageNode
): Promise<void> => {
  const image = await loadVideoImage(node.src);
  const r = getImageDestinationRect(image, node);

  if (node.fit === "cover") {
    context.drawImage(
      image,
      r.sx ?? 0,
      r.sy ?? 0,
      r.sw ?? image.width,
      r.sh ?? image.height,
      r.dx,
      r.dy,
      r.dw,
      r.dh
    );
    return;
  }

  context.drawImage(image, r.dx, r.dy, r.dw, r.dh);
};

const drawMathNode = (
  context: CanvasRenderingContext2D,
  node: ResolvedMathNode,
  mathImages: Map<string, Image>
): void => {
  const key = buildMathCacheKey(node.latex, node.color);
  const image = mathImages.get(key);

  if (!image || image.height === 0) {
    return;
  }

  const scale = node.fontSize / image.height;
  context.drawImage(image, 0, 0, image.width * scale, image.height * scale);
};

const strokePath = (
  context: CanvasRenderingContext2D,
  points: Point2D[],
  color: string,
  strokeWidth: number
): void => {
  if (points.length === 0) {
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    context.lineTo(points[i].x, points[i].y);
  }

  context.strokeStyle = color;
  context.lineWidth = strokeWidth;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.stroke();
};

const GRID_LINES = 5;

const drawFunctionGraphNode = (
  context: CanvasRenderingContext2D,
  node: ResolvedFunctionGraphNode,
  graphPoints: Map<string, Point2D[]>
): void => {
  const points = graphPoints.get(node.id);
  if (!points || points.length === 0) {
    return;
  }

  if (node.showGrid) {
    context.strokeStyle = "#ffffff1a";
    context.lineWidth = 1;
    for (let i = 1; i < GRID_LINES; i++) {
      const x = (i / GRID_LINES) * node.width;
      const y = (i / GRID_LINES) * node.height;
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, node.height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(node.width, y);
      context.stroke();
    }
  }

  if (node.showAxes) {
    const xMin = node.xRange[0] ?? 0;
    const xMax = node.xRange[1] ?? 1;
    const yMin = node.yRange[0] ?? 0;
    const yMax = node.yRange[1] ?? 1;
    context.strokeStyle = "#ffffff33";
    context.lineWidth = 1;

    if (xMin <= 0 && xMax >= 0) {
      const ax = ((0 - xMin) / (xMax - xMin)) * node.width;
      context.beginPath();
      context.moveTo(ax, 0);
      context.lineTo(ax, node.height);
      context.stroke();
    }
    if (yMin <= 0 && yMax >= 0) {
      const ay = (1 - (0 - yMin) / (yMax - yMin)) * node.height;
      context.beginPath();
      context.moveTo(0, ay);
      context.lineTo(node.width, ay);
      context.stroke();
    }
  }

  const visibleCount = Math.floor(points.length * node.drawProgress);
  strokePath(
    context,
    points.slice(0, visibleCount),
    node.color,
    node.strokeWidth
  );
};

const drawParametricGraphNode = (
  context: CanvasRenderingContext2D,
  node: ResolvedParametricGraphNode,
  graphPoints: Map<string, Point2D[]>
): void => {
  const points = graphPoints.get(node.id);
  if (!points || points.length === 0) {
    return;
  }

  const visibleCount = Math.floor(points.length * node.drawProgress);
  strokePath(
    context,
    points.slice(0, visibleCount),
    node.color,
    node.strokeWidth
  );
};

// ---------------------------------------------------------------------------
// Main draw dispatch
// ---------------------------------------------------------------------------

const drawResolvedNode = async (
  context: CanvasRenderingContext2D,
  node: ResolvedVideoNode,
  caches: PreRenderCaches
): Promise<void> => {
  context.save();
  applyNodeTransform(context, node);

  try {
    if (node.type === "rect") {
      drawRoundedRect(context, node);
    } else if (node.type === "text") {
      drawTextNode(context, node);
    } else if (node.type === "math") {
      drawMathNode(context, node, caches.mathImages);
    } else if (node.type === "functionGraph") {
      drawFunctionGraphNode(context, node, caches.graphPoints);
    } else if (node.type === "parametricGraph") {
      drawParametricGraphNode(context, node, caches.graphPoints);
    } else {
      await drawImageNode(context, node);
    }
  } finally {
    context.restore();
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const renderFrameToRgba = async (
  videoDescription: VideoDescription,
  absoluteFrame: number,
  caches: PreRenderCaches
): Promise<Buffer> => {
  try {
    const frame = resolveFrame(videoDescription, absoluteFrame, caches);
    const canvas = new Canvas(videoDescription.width, videoDescription.height);
    canvas.gpu = true;
    const context = canvas.getContext("2d");

    context.clearRect(0, 0, videoDescription.width, videoDescription.height);
    context.fillStyle = frame.background;
    context.fillRect(0, 0, videoDescription.width, videoDescription.height);

    for (const node of frame.nodes) {
      await drawResolvedNode(context, node, caches);
    }

    return canvas.toBufferSync("raw", { colorType: "rgba" });
  } catch (error) {
    throw toAppError(error, "RENDER_ERROR", {
      message: `Failed to rasterize frame ${absoluteFrame}.`,
    });
  }
};
