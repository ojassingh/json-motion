import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface BenchmarkCase {
  description: Record<string, unknown>;
  name: string;
  threshold: PixelDiffThreshold;
}

interface BenchmarkSample {
  encodeMs: number;
  maxRssKb: number | null;
  renderMs: number;
  wallMs: number;
}

interface PixelDiffMetrics {
  avgChannelDiff: number;
  changedPixelRatio: number;
}

interface PixelDiffThreshold {
  maxAvgChannelDiff: number;
  maxChangedPixelRatio: number;
}

type Backend = "cpu" | "gpu";

const ENGINE_PATH = join(
  process.cwd(),
  "engine",
  "target",
  "release",
  "engine"
);
const CODEC = process.env.BENCH_CODEC;
const VERIFY_CODEC = process.env.BENCH_VERIFY_CODEC ?? "libx264";
const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "3", 10);
const PARALLEL_WORKERS = Number.parseInt(
  process.env.BENCH_PARALLEL_WORKERS ?? "1",
  10
);
const TIMINGS_PATTERN = /timings:\s+render=([0-9.]+)ms,\s+encode=([0-9.]+)ms/;
const DARWIN_MAX_RSS_PATTERN = /maximum resident set size\s+(\d+)/i;
const LINUX_MAX_RSS_PATTERN = /Maximum resident set size \(kbytes\):\s+(\d+)/i;

const CASES: BenchmarkCase[] = [
  {
    name: "rect-stress",
    description: createDenseRectGrid(),
    threshold: { maxAvgChannelDiff: 6, maxChangedPixelRatio: 0.08 },
  },
  {
    name: "text-heavy",
    description: createLayoutTextStack(),
    threshold: { maxAvgChannelDiff: 10, maxChangedPixelRatio: 0.18 },
  },
  {
    name: "icon-dense",
    description: createIconGrid(),
    threshold: { maxAvgChannelDiff: 12, maxChangedPixelRatio: 0.2 },
  },
  {
    name: "math-complex",
    description: createMathComplex(),
    threshold: { maxAvgChannelDiff: 14, maxChangedPixelRatio: 0.24 },
  },
  {
    name: "mixed-dense",
    description: createMixedDense(),
    threshold: { maxAvgChannelDiff: 14, maxChangedPixelRatio: 0.22 },
  },
  {
    name: "long-form",
    description: createLongForm(),
    threshold: { maxAvgChannelDiff: 14, maxChangedPixelRatio: 0.22 },
  },
];

function createBaseDescription() {
  return {
    background: "#000000",
    fps: 60,
    height: 720,
    scenes: [] as Record<string, unknown>[],
    width: 1280,
  };
}

function createDenseRectGrid() {
  const desc = createBaseDescription();
  const nodes: Record<string, unknown> = {};
  let id = 0;

  for (let row = 0; row < 40; row++) {
    for (let col = 0; col < 50; col++) {
      nodes[`rect${id}`] = {
        cornerRadius: 2,
        fill: (row + col) % 2 === 0 ? "#38bdf8" : "#f8fafc",
        height: 10,
        type: "rect",
        width: 18,
        x: 8 + col * 25,
        y: 8 + row * 17,
      };
      id += 1;
    }
  }

  desc.scenes.push({
    duration: 120,
    id: "scene1",
    nodes,
    startFrame: 0,
    timeline: [],
  });

  return desc;
}

function createLayoutTextStack() {
  const desc = createBaseDescription();
  const nodes: Record<string, unknown> = {};
  const children: string[] = [];

  for (let index = 0; index < 240; index++) {
    const textId = `text${index}`;
    children.push(textId);
    nodes[textId] = {
      color: index % 2 === 0 ? "#f8fafc" : "#38bdf8",
      size: 18 + (index % 3),
      text: `Row ${index} speed benchmark`,
      type: "text",
    };
  }

  nodes.stack = {
    align: "start",
    children,
    direction: "vertical",
    gap: 4,
    type: "stack",
    width: 420,
  };
  nodes.wrap = {
    children: ["stack"],
    height: 720,
    padding: 24,
    position: "top-left",
    type: "align",
    width: 1280,
  };

  desc.scenes.push({
    duration: 120,
    id: "scene1",
    nodes,
    startFrame: 0,
    timeline: [],
  });

  return desc;
}

function createIconGrid() {
  const desc = createBaseDescription();
  const nodes: Record<string, unknown> = {};
  const elements = [
    { d: "M5 12h14", type: "path" },
    { d: "m12 5 7 7-7 7", type: "path" },
  ];
  let id = 0;

  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 20; col++) {
      nodes[`icon${id}`] = {
        elements,
        height: 40,
        opacity: 0.9,
        stroke: "#38bdf8",
        strokeWidth: 2,
        type: "icon",
        width: 40,
        x: 10 + col * 62,
        y: 16 + row * 45,
      };
      id += 1;
    }
  }

  desc.scenes.push({
    duration: 120,
    id: "scene1",
    nodes,
    startFrame: 0,
    timeline: [],
  });

  return desc;
}

function createMathComplex() {
  const desc = createBaseDescription();
  const nodes: Record<string, unknown> = {};
  const elements = [
    { d: "M3 12h18", type: "path" },
    { d: "M12 3v18", type: "path" },
    { d: "M5 6c2-2 4-3 7-3s5 1 7 3", type: "path" },
    { d: "M5 18c2 2 4 3 7 3s5-1 7-3", type: "path" },
    { d: "M6 8h12", type: "path" },
    { d: "M6 16h12", type: "path" },
  ];
  let id = 0;

  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 16; col++) {
      nodes[`math${id}`] = {
        elements,
        height: 48,
        opacity: 0.9,
        stroke: row % 2 === 0 ? "#e2e8f0" : "#38bdf8",
        strokeWidth: 1.8,
        type: "icon",
        width: 48,
        x: 14 + col * 76,
        y: 14 + row * 56,
      };
      id += 1;
    }
  }

  desc.scenes.push({
    duration: 180,
    id: "scene1",
    nodes,
    startFrame: 0,
    timeline: [],
  });

  return desc;
}

function createMixedDense() {
  const desc = createBaseDescription();
  const nodes: Record<string, unknown> = {};
  const timeline: Record<string, unknown>[] = [];
  const iconElements = [
    { d: "M5 12h14", type: "path" },
    { d: "m12 5 7 7-7 7", type: "path" },
  ];

  let rectId = 0;
  for (let row = 0; row < 18; row++) {
    for (let col = 0; col < 24; col++) {
      const id = `rect${rectId}`;
      nodes[id] = {
        cornerRadius: 4,
        fill: (row + col) % 2 === 0 ? "#0f172a" : "#38bdf8",
        height: 18,
        opacity: 0.8,
        type: "rect",
        width: 18,
        x: 18 + col * 50,
        y: 18 + row * 36,
      };
      rectId += 1;
    }
  }

  for (let i = 0; i < 80; i++) {
    nodes[`label${i}`] = {
      color: i % 2 === 0 ? "#f8fafc" : "#cbd5e1",
      size: 16 + (i % 4),
      text: `Segment ${i}`,
      type: "text",
      x: 24 + (i % 10) * 120,
      y: 30 + Math.floor(i / 10) * 58,
    };
  }

  for (let i = 0; i < 90; i++) {
    nodes[`icon${i}`] = {
      elements: iconElements,
      height: 28,
      opacity: 0.9,
      stroke: "#f8fafc",
      strokeWidth: 2,
      type: "icon",
      width: 28,
      x: 30 + (i % 15) * 82,
      y: 420 + Math.floor(i / 15) * 40,
    };
  }

  timeline.push({
    at: 0.2,
    dur: 0.6,
    ease: "ease-in-out",
    dx: 10,
    target: Object.keys(nodes).filter((key) => key.startsWith("rect")),
  });

  desc.scenes.push({
    duration: 360,
    id: "scene1",
    nodes,
    startFrame: 0,
    timeline,
  });

  return desc;
}

function createLongForm() {
  const desc = createMixedDense();
  desc.scenes[0] = {
    ...desc.scenes[0],
    duration: 7200,
  };
  return desc;
}

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function runCase(
  testCase: BenchmarkCase,
  backend: Backend,
  options?: { codec?: string; keepOutput?: boolean; parallelWorkers?: number }
) {
  const tempDir = mkdtempSync(join(tmpdir(), `engine-bench-${testCase.name}-`));
  const inputPath = join(tempDir, "input.json");
  const outputPath = join(tempDir, `${backend}.mp4`);
  writeFileSync(inputPath, JSON.stringify(testCase.description));

  const args = [inputPath, outputPath];
  if (options?.codec) {
    args.push(options.codec);
  }
  args.push(`--backend=${backend}`);
  const parallelWorkers = options?.parallelWorkers ?? 1;
  if (parallelWorkers > 1) {
    args.push(`--parallel-workers=${parallelWorkers}`);
  }

  const started = process.hrtime.bigint();
  const result = runTimedProcess(args);
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;

  if (result.status !== 0) {
    throw new Error(`Benchmark ${testCase.name} failed:\n${result.stderr}`);
  }

  const match = result.stderr.match(TIMINGS_PATTERN);
  if (!match) {
    throw new Error(`Benchmark ${testCase.name} did not emit timing output.`);
  }

  const sample: BenchmarkSample = {
    encodeMs: Number(match[2]),
    maxRssKb: parseMaxRssKb(result.stderr),
    renderMs: Number(match[1]),
    wallMs: Number(wallMs.toFixed(2)),
  };

  if (options?.keepOutput) {
    return { outputPath, sample, tempDir };
  }

  rmSync(tempDir, { force: true, recursive: true });
  return { sample };
}

function runTimedProcess(args: string[]) {
  if (existsSync("/usr/bin/time")) {
    const timeArgs =
      process.platform === "darwin"
        ? ["-l", ENGINE_PATH, ...args]
        : ["-v", ENGINE_PATH, ...args];

    return spawnSync("/usr/bin/time", timeArgs, {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    });
  }

  return spawnSync(ENGINE_PATH, args, {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
}

function parseMaxRssKb(stderr: string) {
  const darwinMatch = stderr.match(DARWIN_MAX_RSS_PATTERN);
  if (darwinMatch) {
    return Number(darwinMatch[1]);
  }

  const linuxMatch = stderr.match(LINUX_MAX_RSS_PATTERN);
  if (linuxMatch) {
    return Number(linuxMatch[1]);
  }

  return null;
}

function extractFirstFrame(videoPath: string): Buffer {
  const result = spawnSync(
    "ffmpeg",
    [
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    {
      encoding: null,
      maxBuffer: 50 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  if (result.status !== 0) {
    throw new Error(`ffmpeg frame extraction failed for ${videoPath}`);
  }

  return result.stdout as unknown as Buffer;
}

function computePixelDiff(
  cpuFrame: Buffer,
  gpuFrame: Buffer
): PixelDiffMetrics {
  if (cpuFrame.length !== gpuFrame.length) {
    throw new Error("CPU/GPU frame sizes differ");
  }

  let totalChannelDiff = 0;
  let changedPixels = 0;
  const pixelCount = cpuFrame.length / 4;

  for (let i = 0; i < cpuFrame.length; i += 4) {
    let pixelDiff = 0;
    for (let channel = 0; channel < 4; channel++) {
      pixelDiff += Math.abs(cpuFrame[i + channel] - gpuFrame[i + channel]);
    }
    totalChannelDiff += pixelDiff;
    if (pixelDiff > 48) {
      changedPixels += 1;
    }
  }

  return {
    avgChannelDiff: Number((totalChannelDiff / cpuFrame.length).toFixed(4)),
    changedPixelRatio: Number((changedPixels / pixelCount).toFixed(4)),
  };
}

function verifyPixelDiff(testCase: BenchmarkCase) {
  const cpuRun = runCase(testCase, "cpu", {
    codec: VERIFY_CODEC,
    keepOutput: true,
  }) as { outputPath: string; sample: BenchmarkSample; tempDir: string };
  const gpuRun = runCase(testCase, "gpu", {
    codec: VERIFY_CODEC,
    keepOutput: true,
  }) as { outputPath: string; sample: BenchmarkSample; tempDir: string };

  const cpuFrame = extractFirstFrame(cpuRun.outputPath);
  const gpuFrame = extractFirstFrame(gpuRun.outputPath);
  const diff = computePixelDiff(cpuFrame, gpuFrame);

  rmSync(cpuRun.tempDir, { force: true, recursive: true });
  rmSync(gpuRun.tempDir, { force: true, recursive: true });

  return diff;
}

function formatSummary(testCase: BenchmarkCase) {
  const gpuSamples = Array.from(
    { length: ITERATIONS },
    () =>
      runCase(testCase, "gpu", {
        codec: CODEC,
        parallelWorkers: PARALLEL_WORKERS,
      }).sample
  );
  const cpuSample = runCase(testCase, "cpu", { codec: CODEC }).sample;
  const diff = verifyPixelDiff(testCase);

  const gpuRender = gpuSamples.map((sample) => sample.renderMs);
  const gpuEncode = gpuSamples.map((sample) => sample.encodeMs);
  const gpuWall = gpuSamples.map((sample) => sample.wallMs);
  const gpuRss = gpuSamples
    .map((sample) => sample.maxRssKb)
    .filter((value): value is number => value !== null);

  return {
    case: testCase.name,
    cpu: {
      encodeMs: cpuSample.encodeMs,
      maxRssKb: cpuSample.maxRssKb,
      renderMs: cpuSample.renderMs,
      wallMs: cpuSample.wallMs,
    },
    gpu: {
      avgEncodeMs: Number(average(gpuEncode).toFixed(2)),
      avgMaxRssKb:
        gpuRss.length > 0 ? Number(average(gpuRss).toFixed(2)) : null,
      avgRenderMs: Number(average(gpuRender).toFixed(2)),
      avgWallMs: Number(average(gpuWall).toFixed(2)),
      maxRenderMs: Number(Math.max(...gpuRender).toFixed(2)),
      minRenderMs: Number(Math.min(...gpuRender).toFixed(2)),
    },
    pixelDiff: {
      avgChannelDiff: diff.avgChannelDiff,
      changedPixelRatio: diff.changedPixelRatio,
      pass:
        diff.avgChannelDiff <= testCase.threshold.maxAvgChannelDiff &&
        diff.changedPixelRatio <= testCase.threshold.maxChangedPixelRatio,
      threshold: testCase.threshold,
    },
  };
}

function main() {
  if (!existsSync(ENGINE_PATH)) {
    throw new Error(
      `Missing release engine binary at ${ENGINE_PATH}. Run cargo build --release in engine/ first.`
    );
  }

  console.log(
    `codec=${CODEC ?? "auto"} verifyCodec=${VERIFY_CODEC} iterations=${ITERATIONS} parallelWorkers=${PARALLEL_WORKERS}`
  );

  for (const testCase of CASES) {
    console.log(JSON.stringify(formatSummary(testCase)));
  }
}

main();
