import path from "node:path";

export const DEFAULT_CANVAS_FPS = 60;
export const DEFAULT_CANVAS_WIDTH = 1280;
export const DEFAULT_CANVAS_HEIGHT = 720;
export const DEFAULT_MODAL_VIDEO_CODEC = "h264_nvenc";

export const DEFAULT_SCENE_BACKGROUND = "#000000";
export const DEFAULT_TEXT_COLOR = "#f8fafc";
export const DEFAULT_TEXT_FONT_FAMILY = "Inter, Arial, sans-serif";
export const DEFAULT_TEXT_FONT_SIZE = 48;
export const DEFAULT_TEXT_LINE_HEIGHT_MULTIPLIER = 1.2;
export const FFMPEG_BINARY_PATH = process.env.FFMPEG_PATH ?? "ffmpeg";
export const PUBLIC_DIRECTORY_PATH = path.join(process.cwd(), "public");
export const PUBLIC_RENDER_DIRECTORY_NAME = "renders";
export const PUBLIC_RENDER_DIRECTORY_PATH = path.join(
  PUBLIC_DIRECTORY_PATH,
  PUBLIC_RENDER_DIRECTORY_NAME
);
export const PUBLIC_RENDER_URL_PREFIX = `/${PUBLIC_RENDER_DIRECTORY_NAME}`;
export const MODAL_RENDER_TIMEOUT_MS = 30 * 60 * 1000;

const DEFAULT_VIDEO_CODEC_BY_PLATFORM = {
  darwin: "h264_videotoolbox",
  linux: "libx264",
  win32: "libx264",
} as const;

export const getDefaultVideoCodec = (
  platform: NodeJS.Platform = process.platform
): string => {
  const codecFromEnvironment = process.env.VIDEO_RENDER_CODEC;

  if (codecFromEnvironment) {
    return codecFromEnvironment;
  }

  if (platform === "darwin" || platform === "linux" || platform === "win32") {
    return DEFAULT_VIDEO_CODEC_BY_PLATFORM[platform];
  }

  return "libx264";
};

export const getModalRenderEndpoint = (): string | null => {
  const endpoint = process.env.MODAL_RENDER_ENDPOINT?.trim();
  return endpoint && endpoint.length > 0 ? endpoint : null;
};

export const getModalRenderToken = (): string | null => {
  const token = process.env.MODAL_RENDER_TOKEN?.trim();
  return token && token.length > 0 ? token : null;
};

export const getModalVideoCodec = (): string =>
  process.env.MODAL_RENDER_CODEC?.trim() || DEFAULT_MODAL_VIDEO_CODEC;

export const getVideoRenderMode = (): "local" | "modal" => {
  const configuredMode = process.env.VIDEO_RENDER_MODE?.trim().toLowerCase();

  if (configuredMode === "local" || configuredMode === "modal") {
    return configuredMode;
  }

  return getModalRenderEndpoint() ? "modal" : "local";
};
