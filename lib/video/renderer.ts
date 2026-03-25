import { Canvas, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { toAppError } from "@/lib/errors";
import type {
  ResolvedAlignNode,
  ResolvedCenterNode,
  ResolvedFrame,
  ResolvedFunctionGraphNode,
  ResolvedGroupNode,
  ResolvedImageNode,
  ResolvedMathNode,
  ResolvedParametricGraphNode,
  ResolvedRectNode,
  ResolvedStackNode,
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
): {
  height: number;
  width: number;
} => {
  if (
    node.type === "rect" ||
    node.type === "image" ||
    node.type === "math" ||
    node.type === "functionGraph" ||
    node.type === "parametricGraph"
  ) {
    return {
      height: node.height,
      width: node.width,
    };
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

  return {
    height: 0,
    width: 0,
  };
};

const getAnchorOffset = (
  node: ResolvedVideoNode,
  context: CanvasRenderingContext2D
): {
  x: number;
  y: number;
} => {
  const { height, width } = getNodeDimensions(node, context);

  if (node.anchor === "top-left") {
    return { x: 0, y: 0 };
  }

  if (node.anchor === "top-center") {
    return { x: width / 2, y: 0 };
  }

  if (node.anchor === "top-right") {
    return { x: width, y: 0 };
  }

  if (node.anchor === "center-left") {
    return { x: 0, y: height / 2 };
  }

  if (node.anchor === "center") {
    return { x: width / 2, y: height / 2 };
  }

  if (node.anchor === "center-right") {
    return { x: width, y: height / 2 };
  }

  if (node.anchor === "bottom-left") {
    return { x: 0, y: height };
  }

  if (node.anchor === "bottom-center") {
    return { x: width / 2, y: height };
  }

  return { x: width, y: height };
};

const applyNodeTransform = (
  context: CanvasRenderingContext2D,
  node: ResolvedVideoNode
): void => {
  const anchorOffset = getAnchorOffset(node, context);

  context.translate(node.x + anchorOffset.x, node.y + anchorOffset.y);
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
  context.translate(-anchorOffset.x, -anchorOffset.y);
  context.globalAlpha *= node.opacity;
  if (node.blur > 0) {
    context.filter = `blur(${node.blur}px)`;
  }
};

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
  destinationHeight: number;
  destinationWidth: number;
  destinationX: number;
  destinationY: number;
  sourceHeight?: number;
  sourceWidth?: number;
  sourceX?: number;
  sourceY?: number;
} => {
  if (node.fit === "fill") {
    return {
      destinationHeight: node.height,
      destinationWidth: node.width,
      destinationX: 0,
      destinationY: 0,
    };
  }

  const widthRatio = node.width / image.width;
  const heightRatio = node.height / image.height;
  const scale =
    node.fit === "contain"
      ? Math.min(widthRatio, heightRatio)
      : Math.max(widthRatio, heightRatio);

  if (node.fit === "contain") {
    const destinationWidth = image.width * scale;
    const destinationHeight = image.height * scale;

    return {
      destinationHeight,
      destinationWidth,
      destinationX: (node.width - destinationWidth) / 2,
      destinationY: (node.height - destinationHeight) / 2,
    };
  }

  const sourceWidth = node.width / scale;
  const sourceHeight = node.height / scale;

  return {
    destinationHeight: node.height,
    destinationWidth: node.width,
    destinationX: 0,
    destinationY: 0,
    sourceHeight,
    sourceWidth,
    sourceX: (image.width - sourceWidth) / 2,
    sourceY: (image.height - sourceHeight) / 2,
  };
};

const drawImageNode = async (
  context: CanvasRenderingContext2D,
  node: ResolvedImageNode
): Promise<void> => {
  const image = await loadVideoImage(node.src);
  const rect = getImageDestinationRect(image, node);

  if (node.fit === "cover") {
    context.drawImage(
      image,
      rect.sourceX ?? 0,
      rect.sourceY ?? 0,
      rect.sourceWidth ?? image.width,
      rect.sourceHeight ?? image.height,
      rect.destinationX,
      rect.destinationY,
      rect.destinationWidth,
      rect.destinationHeight
    );

    return;
  }

  context.drawImage(
    image,
    rect.destinationX,
    rect.destinationY,
    rect.destinationWidth,
    rect.destinationHeight
  );
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

const drawFunctionGraphAxes = (
  context: CanvasRenderingContext2D,
  node: ResolvedFunctionGraphNode
): void => {
  const xMin = node.xRange[0] ?? 0;
  const xMax = node.xRange[1] ?? 1;
  const yMin = node.yRange[0] ?? 0;
  const yMax = node.yRange[1] ?? 1;
  const axisColor = "#ffffff33";

  context.strokeStyle = axisColor;
  context.lineWidth = 1;

  if (xMin <= 0 && xMax >= 0) {
    const axisX = ((0 - xMin) / (xMax - xMin)) * node.width;
    context.beginPath();
    context.moveTo(axisX, 0);
    context.lineTo(axisX, node.height);
    context.stroke();
  }

  if (yMin <= 0 && yMax >= 0) {
    const axisY = (1 - (0 - yMin) / (yMax - yMin)) * node.height;
    context.beginPath();
    context.moveTo(0, axisY);
    context.lineTo(node.width, axisY);
    context.stroke();
  }
};

const GRID_LINES = 5;

const drawFunctionGraphGrid = (
  context: CanvasRenderingContext2D,
  node: ResolvedFunctionGraphNode
): void => {
  context.strokeStyle = "#ffffff1a";
  context.lineWidth = 1;

  for (let i = 1; i < GRID_LINES; i++) {
    const x = (i / GRID_LINES) * node.width;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, node.height);
    context.stroke();

    const y = (i / GRID_LINES) * node.height;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(node.width, y);
    context.stroke();
  }
};

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
    drawFunctionGraphGrid(context, node);
  }

  if (node.showAxes) {
    drawFunctionGraphAxes(context, node);
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

type ResolvedContainerNode =
  | ResolvedAlignNode
  | ResolvedCenterNode
  | ResolvedGroupNode
  | ResolvedStackNode;

const isContainerNode = (
  node: ResolvedVideoNode
): node is ResolvedContainerNode =>
  node.type === "group" ||
  node.type === "center" ||
  node.type === "stack" ||
  node.type === "align";

const drawContainerNode = async (
  context: CanvasRenderingContext2D,
  node: ResolvedContainerNode,
  caches: PreRenderCaches
): Promise<void> => {
  for (const childNode of node.children) {
    await drawResolvedNode(context, childNode, caches);
  }
};

const drawResolvedNode = async (
  context: CanvasRenderingContext2D,
  node: ResolvedVideoNode,
  caches: PreRenderCaches
): Promise<void> => {
  context.save();
  applyNodeTransform(context, node);

  try {
    if (isContainerNode(node)) {
      await drawContainerNode(context, node, caches);
      return;
    }

    if (node.type === "rect") {
      drawRoundedRect(context, node);
      return;
    }

    if (node.type === "text") {
      drawTextNode(context, node);
      return;
    }

    if (node.type === "math") {
      drawMathNode(context, node, caches.mathImages);
      return;
    }

    if (node.type === "functionGraph") {
      drawFunctionGraphNode(context, node, caches.graphPoints);
      return;
    }

    if (node.type === "parametricGraph") {
      drawParametricGraphNode(context, node, caches.graphPoints);
      return;
    }

    await drawImageNode(context, node);
  } finally {
    context.restore();
  }
};

const createCanvas = (
  videoDescription: VideoDescription
): {
  canvas: Canvas;
  context: CanvasRenderingContext2D;
} => {
  const canvas = new Canvas(videoDescription.width, videoDescription.height);
  canvas.gpu = true;
  return {
    canvas,
    context: canvas.getContext("2d"),
  };
};

const paintFrameBackground = (
  context: CanvasRenderingContext2D,
  frame: ResolvedFrame,
  videoDescription: VideoDescription
): void => {
  context.clearRect(0, 0, videoDescription.width, videoDescription.height);
  context.fillStyle = frame.background;
  context.fillRect(0, 0, videoDescription.width, videoDescription.height);
};

export const renderFrameToRgba = async (
  videoDescription: VideoDescription,
  absoluteFrame: number,
  caches: PreRenderCaches
): Promise<Buffer> => {
  try {
    const frame = resolveFrame(videoDescription, absoluteFrame, caches);
    const { canvas, context } = createCanvas(videoDescription);

    paintFrameBackground(context, frame, videoDescription);

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
