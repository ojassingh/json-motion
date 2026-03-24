import { readFile } from "node:fs/promises";
import path from "node:path";

import { type Image, loadImage } from "skia-canvas";

import { AppError, toAppError } from "@/lib/errors";
import { PUBLIC_DIRECTORY_PATH } from "@/lib/video/config";

const REMOTE_ASSET_PATTERN = /^https?:\/\//i;
const imageCache = new Map<string, Promise<Image>>();

const resolveLocalAssetPath = (src: string): string => {
  const candidatePath = path.resolve(PUBLIC_DIRECTORY_PATH, `.${src}`);

  if (!candidatePath.startsWith(PUBLIC_DIRECTORY_PATH)) {
    throw new AppError("ASSET_LOAD_ERROR", {
      message: `Image source "${src}" must stay within the public directory.`,
      status: 400,
    });
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
    throw toAppError(error, "ASSET_LOAD_ERROR", {
      message: `Unable to load image asset "${src}".`,
      status: 422,
    });
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
