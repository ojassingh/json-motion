import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AppError, toAppError } from "@/lib/errors";
import type { VideoDescription, VideoTimingMetrics } from "@/lib/types/video";
import { getDefaultVideoCodec } from "@/lib/video/config";

const ENGINE_PATH = path.join(
  process.cwd(),
  "engine",
  "target",
  "release",
  "engine"
);
const TIMINGS_REGEX = /timings:\s+render=([0-9.]+)ms,\s+encode=([0-9.]+)ms/;

export const renderVideoWithRust = async (
  videoDescription: VideoDescription,
  outputFilePath: string,
  codec?: string
): Promise<VideoTimingMetrics> => {
  const jobId = randomUUID();
  const inputPath = path.join(tmpdir(), `scene-${jobId}.json`);

  try {
    await writeFile(inputPath, JSON.stringify(videoDescription));

    const resolvedCodec = codec ?? getDefaultVideoCodec();
    const child = spawn(
      ENGINE_PATH,
      [inputPath, outputFilePath, resolvedCodec],
      { stdio: ["ignore", "ignore", "pipe"] }
    );

    let stderr = "";
    let timings: VideoTimingMetrics = {
      encodeMs: 0,
      renderMs: 0,
    };
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      const timingMatch = chunk.match(TIMINGS_REGEX);
      if (timingMatch) {
        timings = {
          encodeMs: Number(timingMatch[2]),
          renderMs: Number(timingMatch[1]),
        };
      }
      process.stderr.write(`[engine] ${chunk}`);
    });

    const [exitCode] = (await once(child, "close")) as [number | null];

    if (exitCode !== 0) {
      throw new AppError("RENDER_ERROR", {
        details: stderr
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        message: `Rust engine exited with code ${exitCode}.`,
      });
    }

    return timings;
  } catch (error) {
    throw toAppError(error, "RENDER_ERROR", {
      message: "Rust render engine failed.",
    });
  } finally {
    await unlink(inputPath).catch(() => undefined);
  }
};
