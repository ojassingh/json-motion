import { Canvas, type CanvasRenderingContext2D, type Image } from "skia-canvas";
import { toAppError } from "@/lib/errors";
import type {
  ResolvedFrame,
  ResolvedGroupNode,
  ResolvedImageNode,
  ResolvedRectNode,
  ResolvedTextNode,
  ResolvedVideoNode,
  VideoDescription,
} from "@/lib/types/video";
import { resolveFrame } from "@/lib/video/animation";
import { loadVideoImage } from "@/lib/video/assets";

const degreesToRadians = (degrees: number): number => (degrees * Math.PI) / 180;

const getNodeDimensions = (
  node: ResolvedVideoNode
): {
  height: number;
  width: number;
} => {
  if (node.type === "rect" || node.type === "image") {
    return {
      height: node.height,
      width: node.width,
    };
  }

  if (node.type === "text") {
    return {
      height: node.lineHeight * node.text.split("\n").length,
      width: node.maxWidth ?? 0,
    };
  }

  return {
    height: 0,
    width: 0,
  };
};

const getAnchorOffset = (
  node: ResolvedVideoNode
): {
  x: number;
  y: number;
} => {
  const { height, width } = getNodeDimensions(node);

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
  const anchorOffset = getAnchorOffset(node);

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

const drawGroupNode = async (
  context: CanvasRenderingContext2D,
  node: ResolvedGroupNode
): Promise<void> => {
  for (const childNode of node.children) {
    await drawResolvedNode(context, childNode);
  }
};

const drawResolvedNode = async (
  context: CanvasRenderingContext2D,
  node: ResolvedVideoNode
): Promise<void> => {
  context.save();
  applyNodeTransform(context, node);

  try {
    if (node.type === "group") {
      await drawGroupNode(context, node);
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
  absoluteFrame: number
): Promise<Buffer> => {
  try {
    const frame = resolveFrame(videoDescription, absoluteFrame);
    const { canvas, context } = createCanvas(videoDescription);

    paintFrameBackground(context, frame, videoDescription);

    for (const node of frame.nodes) {
      await drawResolvedNode(context, node);
    }

    return canvas.toBufferSync("raw", { colorType: "rgba" });
  } catch (error) {
    throw toAppError(error, "RENDER_ERROR", {
      message: `Failed to rasterize frame ${absoluteFrame}.`,
    });
  }
};
