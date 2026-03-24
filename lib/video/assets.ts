import { readFile } from "node:fs/promises";
import path from "node:path";

import { type Image, loadImage } from "skia-canvas";

import { PUBLIC_DIRECTORY_PATH } from "@/lib/video/config";
import { VideoRenderError } from "@/lib/video/errors";

const REMOTE_ASSET_PATTERN = /^https?:\/\//i;
const imageCache = new Map<string, Promise<Image>>();

const resolveLocalAssetPath = (src: string): string => {
  const candidatePath = path.resolve(PUBLIC_DIRECTORY_PATH, `.${src}`);

  if (!candidatePath.startsWith(PUBLIC_DIRECTORY_PATH)) {
    throw new VideoRenderError(
      "ASSET_LOAD_ERROR",
      `Image source "${src}" must stay within the public directory.`,
      { status: 400 }
    );
  }

  return candidatePath;
};

const loadLocalAsset = async (src: string): Promise<Image> => {
  const assetBuffer = await readFile(resolveLocalAssetPath(src));
  return loadImage(assetBuffer);
};

const loadVideoImageInternal = async (src: string): Promise<Image> => {
  try {
    if (REMOTE_ASSET_PATTERN.test(src)) {
      return await loadImage(src);
    }

    if (src.startsWith("/")) {
      return await loadLocalAsset(src);
    }

    return await loadImage(src);
  } catch (error) {
    if (error instanceof Error) {
      throw new VideoRenderError(
        "ASSET_LOAD_ERROR",
        `Unable to load image asset "${src}".`,
        { cause: error, status: 422 }
      );
    }

    throw new VideoRenderError(
      "ASSET_LOAD_ERROR",
      `Unable to load image asset "${src}".`,
      {
        status: 422,
      }
    );
  }
};

export const loadVideoImage = (src: string): Promise<Image> => {
  const cachedImage = imageCache.get(src);

  if (cachedImage) {
    return cachedImage;
  }

  const imagePromise = loadVideoImageInternal(src);
  imageCache.set(src, imagePromise);
  return imagePromise;
};
