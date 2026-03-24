import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { AppError, toAppError } from "@/lib/errors";
import type { VideoDescription } from "@/lib/types/video";
import { FFMPEG_BINARY_PATH } from "@/lib/video/config";

const writeFrame = async (
  stream: NodeJS.WritableStream,
  frame: Buffer
): Promise<void> => {
  if (!stream.write(frame)) {
    await once(stream, "drain");
  }
};

export const encodeVideoFrames = async (
  videoDescription: VideoDescription,
  codec: string,
  outputFilePath: string,
  frameBuffers: AsyncIterable<Buffer>
): Promise<void> => {
  await mkdir(path.dirname(outputFilePath), { recursive: true });

  const ffmpegArguments = [
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s:v",
    `${videoDescription.width}x${videoDescription.height}`,
    "-r",
    `${videoDescription.fps}`,
    "-i",
    "pipe:0",
    "-an",
    "-vcodec",
    codec,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputFilePath,
  ];

  const ffmpegProcess = spawn(FFMPEG_BINARY_PATH, ffmpegArguments, {
    stdio: ["pipe", "ignore", "pipe"],
  });

  let errorOutput = "";

  ffmpegProcess.stderr.setEncoding("utf8");
  ffmpegProcess.stderr.on("data", (chunk: string) => {
    errorOutput += chunk;
  });

  const processErrorPromise = once(ffmpegProcess, "error").then(([error]) => {
    if (error instanceof Error) {
      throw new AppError("DEPENDENCY_ERROR", {
        cause: error,
        message: `Unable to start ffmpeg from "${FFMPEG_BINARY_PATH}".`,
      });
    }

    throw new AppError("DEPENDENCY_ERROR", {
      message: `Unable to start ffmpeg from "${FFMPEG_BINARY_PATH}".`,
    });
  });

  try {
    for await (const frameBuffer of frameBuffers) {
      await writeFrame(ffmpegProcess.stdin, frameBuffer);
    }

    ffmpegProcess.stdin.end();

    const [exitCode] = (await Promise.race([
      once(ffmpegProcess, "close"),
      processErrorPromise,
    ])) as [number | null];

    if (exitCode !== 0) {
      throw new AppError("ENCODER_ERROR", {
        details: errorOutput
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        message: "ffmpeg exited before the MP4 could be finalized.",
      });
    }
  } catch (error) {
    ffmpegProcess.kill("SIGKILL");

    throw toAppError(error, "ENCODER_ERROR", {
      message: "The encoder failed while streaming video frames.",
    });
  }
};
