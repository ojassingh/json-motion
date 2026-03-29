import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AppError, toAppError } from "@/lib/errors";
import type { VideoDescription } from "@/lib/types/video";
import { getDefaultVideoCodec } from "@/lib/video/config";

const ENGINE_PATH = path.join(
  process.cwd(),
  "engine",
  "target",
  "release",
  "engine"
);

export const renderVideoWithRust = async (
  videoDescription: VideoDescription,
  outputFilePath: string,
  codec?: string
): Promise<void> => {
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
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
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
  } catch (error) {
    throw toAppError(error, "RENDER_ERROR", {
      message: "Rust render engine failed.",
    });
  } finally {
    await unlink(inputPath).catch(() => undefined);
  }
};
