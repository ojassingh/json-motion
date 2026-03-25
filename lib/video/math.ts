import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { AllPackages } from "mathjax-full/js/input/tex/AllPackages.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { type Image, loadImage } from "skia-canvas";
import { AppError, toAppError } from "@/lib/errors";
import type { VideoMathNode, VideoScene } from "@/lib/types/video";

const EX_TO_PX = 8;

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const mathDoc = mathjax.document("", {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: "none" }),
});

const collectMathNodes = (scenes: VideoScene[]): VideoMathNode[] => {
  const nodes: VideoMathNode[] = [];

  for (const scene of scenes) {
    const stack = [...scene.nodes];
    while (stack.length > 0) {
      const node = stack.pop();
      if (!node) {
        continue;
      }
      if (node.type === "math") {
        nodes.push(node);
      } else if (node.type === "group") {
        stack.push(...node.children);
      }
    }
  }

  return nodes;
};

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

export const preRenderMathNodes = async (
  scenes: VideoScene[]
): Promise<Map<string, Image>> => {
  const mathNodes = collectMathNodes(scenes);
  const cache = new Map<string, Image>();

  const seen = new Set<string>();
  for (const node of mathNodes) {
    const color = node.color ?? "#f8fafc";
    const key = `${node.latex}::${color}`;
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
