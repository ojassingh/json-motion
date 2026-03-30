import { spawnSync } from "node:child_process";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

interface BenchmarkCase {
  description: Record<string, unknown>;
  name: string;
}

interface BenchmarkSample {
  encodeMs: number;
  renderMs: number;
  wallMs: number;
}

const CASES: BenchmarkCase[] = [
  {
    name: "simple_motion",
    description: {
      background: "#000000",
      fps: 60,
      height: 720,
      scenes: [
        {
          duration: 180,
          id: "scene1",
          nodes: {
            square: {
              cornerRadius: 16,
              fill: "#f8fafc",
              height: 180,
              opacity: 0,
              type: "rect",
              width: 180,
            },
            wrap: {
              children: ["square"],
              type: "center",
            },
          },
          startFrame: 0,
          timeline: [
            {
              at: 1,
              dur: 0.8,
              ease: "ease-out",
              opacity: 1,
              target: "square",
            },
            {
              at: 2.1,
              dur: 1,
              ease: "ease-in-out",
              rotate: 45,
              target: "square",
            },
          ],
        },
      ],
      width: 1280,
    },
  },
  {
    name: "dense_rect_grid_2000",
    description: createDenseRectGrid(),
  },
  {
    name: "animated_rect_grid_400",
    description: createAnimatedRectGrid(),
  },
  {
    name: "layout_text_stack_200",
    description: createLayoutTextStack(),
  },
  {
    name: "icon_grid_300",
    description: createIconGrid(),
  },
];

const ENGINE_PATH = path.join(
  process.cwd(),
  "engine",
  "target",
  "release",
  "engine"
);
const CODEC = process.platform === "darwin" ? "h264_videotoolbox" : "libx264";
const ITERATIONS = Number.parseInt(process.env.BENCH_ITERATIONS ?? "3", 10);
const TIMINGS_PATTERN = /timings:\s+render=([0-9.]+)ms,\s+encode=([0-9.]+)ms/;

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

  for (let index = 0; index < 200; index++) {
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

function createAnimatedRectGrid() {
  const desc = createBaseDescription();
  const nodes: Record<string, unknown> = {};
  const targets: string[] = [];
  let id = 0;

  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 20; col++) {
      const nodeId = `shape${id}`;
      targets.push(nodeId);
      nodes[nodeId] = {
        cornerRadius: 3,
        fill: (row + col) % 3 === 0 ? "#38bdf8" : "#f8fafc",
        height: 18,
        opacity: 0.35,
        type: "rect",
        width: 18,
        x: 70 + col * 28,
        y: 70 + row * 24,
      };
      id += 1;
    }
  }

  desc.scenes.push({
    duration: 360,
    id: "scene1",
    nodes,
    startFrame: 0,
    timeline: [
      { at: 0.15, dur: 0.25, ease: "ease-out", opacity: 1, target: targets },
      { at: 0.45, dur: 0.3, dx: 14, ease: "ease-in-out", target: targets },
      { at: 0.8, dur: 0.3, dy: -10, ease: "ease-in-out", target: targets },
      { at: 1.15, dur: 0.28, ease: "ease-in-out", rotate: 10, target: targets },
      { at: 1.5, dur: 0.3, dx: -8, ease: "ease-in-out", target: targets },
      { at: 1.85, dur: 0.28, dy: 8, ease: "ease-in-out", target: targets },
      { at: 2.2, dur: 0.25, ease: "ease-in-out", rotate: -8, target: targets },
      {
        at: 2.55,
        dur: 0.25,
        ease: "ease-in-out",
        opacity: 0.6,
        target: targets,
      },
      { at: 2.85, dur: 0.3, dx: 12, ease: "ease-in-out", target: targets },
      { at: 3.2, dur: 0.3, dy: -8, ease: "ease-in-out", target: targets },
      { at: 3.55, dur: 0.28, ease: "ease-in-out", rotate: 7, target: targets },
      { at: 3.9, dur: 0.3, dx: -14, ease: "ease-in-out", target: targets },
      { at: 4.25, dur: 0.28, dy: 10, ease: "ease-in-out", target: targets },
      { at: 4.6, dur: 0.25, ease: "ease-in-out", rotate: -6, target: targets },
      {
        at: 4.95,
        dur: 0.25,
        ease: "ease-in-out",
        opacity: 0.92,
        target: targets,
      },
      { at: 5.25, dur: 0.3, dx: 8, ease: "ease-in-out", target: targets },
      { at: 5.6, dur: 0.28, dy: -6, ease: "ease-in-out", target: targets },
      { at: 5.92, dur: 0.08, ease: "ease-in", opacity: 0.7, target: targets },
    ],
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

function average(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function runCase(testCase: BenchmarkCase): BenchmarkSample {
  const inputPath = path.join(tmpdir(), `${testCase.name}-${Date.now()}.json`);
  const outputPath = path.join(tmpdir(), `${testCase.name}-${Date.now()}.mp4`);
  writeFileSync(inputPath, JSON.stringify(testCase.description));

  const started = process.hrtime.bigint();
  const result = spawnSync(ENGINE_PATH, [inputPath, outputPath, CODEC], {
    encoding: "utf8",
  });
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6;

  rmSync(inputPath, { force: true });
  rmSync(outputPath, { force: true });

  if (result.status !== 0) {
    throw new Error(`Benchmark ${testCase.name} failed:\n${result.stderr}`);
  }

  const match = result.stderr.match(TIMINGS_PATTERN);
  if (!match) {
    throw new Error(`Benchmark ${testCase.name} did not emit timing output.`);
  }

  return {
    encodeMs: Number(match[2]),
    renderMs: Number(match[1]),
    wallMs: Number(wallMs.toFixed(2)),
  };
}

function main() {
  if (!existsSync(ENGINE_PATH)) {
    throw new Error(
      `Missing release engine binary at ${ENGINE_PATH}. Run cargo build --release in engine/ first.`
    );
  }

  console.log(`codec=${CODEC} iterations=${ITERATIONS}`);

  for (const testCase of CASES) {
    const samples = Array.from({ length: ITERATIONS }, () => runCase(testCase));
    const renderValues = samples.map((sample) => sample.renderMs);
    const encodeValues = samples.map((sample) => sample.encodeMs);
    const wallValues = samples.map((sample) => sample.wallMs);

    console.log(
      JSON.stringify({
        avgEncodeMs: Number(average(encodeValues).toFixed(2)),
        avgRenderMs: Number(average(renderValues).toFixed(2)),
        avgWallMs: Number(average(wallValues).toFixed(2)),
        case: testCase.name,
        maxRenderMs: Number(Math.max(...renderValues).toFixed(2)),
        minRenderMs: Number(Math.min(...renderValues).toFixed(2)),
      })
    );
  }
}

main();
