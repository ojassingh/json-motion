import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { type Image, loadImage } from "skia-canvas";
import { AppError, toAppError } from "@/lib/errors";
import type { VideoMathNode, VideoScene } from "@/lib/types/video";
import { flattenSceneNodes } from "@/lib/video/nodes";

const EX_TO_PX = 8;
const DEFAULT_MATH_COLOR = "#f8fafc";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const mathDoc = mathjax.document("", {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: "none" }),
});

const collectMathNodes = (scenes: VideoScene[]): VideoMathNode[] =>
  flattenSceneNodes(scenes).filter(
    (node): node is VideoMathNode => node.type === "math"
  );

const svgToPixelDimensions = (svg: string): string =>
  svg
    .replace(
      /\bwidth="([\d.]+)ex"/g,
      (_, w) => `width="${Math.ceil(Number.parseFloat(w) * EX_TO_PX)}"`
    )
    .replace(
      /\bheight="([\d.]+)ex"/g,
      (_, h) => `height="${Math.ceil(Number.parseFloat(h) * EX_TO_PX)}"`
    );

const latexToSvg = (latex: string, color: string): string => {
  const node = mathDoc.convert(latex, { display: true });
  const raw: string = adaptor.innerHTML(node);

  if (raw.includes("data-mjx-error") || raw.includes("merror")) {
    throw new AppError("PRERENDER_ERROR", {
      message: `Invalid LaTeX expression: "${latex}"`,
    });
  }

  return svgToPixelDimensions(raw).replace(/currentColor/g, color);
};

export const buildMathCacheKey = (latex: string, color: string): string =>
  `${latex}::${color}`;

export const resolveMathDimensions = (
  node: Pick<
    VideoMathNode,
    "color" | "fontSize" | "height" | "latex" | "width"
  >,
  mathImages?: Map<string, Image>
): {
  height: number;
  width: number;
} => {
  const color = node.color ?? DEFAULT_MATH_COLOR;
  const image = mathImages?.get(buildMathCacheKey(node.latex, color));

  if (image && image.height > 0) {
    const scale = node.fontSize / image.height;
    return {
      height: node.fontSize,
      width: image.width * scale,
    };
  }

  return {
    height: node.height ?? 0,
    width: node.width ?? 0,
  };
};

export const preRenderMathNodes = async (
  scenes: VideoScene[]
): Promise<Map<string, Image>> => {
  const mathNodes = collectMathNodes(scenes);
  const cache = new Map<string, Image>();

  const seen = new Set<string>();
  for (const node of mathNodes) {
    const color = node.color ?? DEFAULT_MATH_COLOR;
    const key = buildMathCacheKey(node.latex, color);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    try {
      const svg = latexToSvg(node.latex, color);
      const image = await loadImage(Buffer.from(svg, "utf-8"));
      cache.set(key, image);
    } catch (error) {
      throw toAppError(error, "PRERENDER_ERROR", {
        message: `Failed to pre-render LaTeX: "${node.latex}"`,
      });
    }
  }

  return cache;
};
