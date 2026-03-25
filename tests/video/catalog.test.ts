import { describe, expect, it } from "bun:test";
import {
  PROMPT_TO_VIDEO_SYSTEM_PROMPT,
  videoCatalog,
} from "@/lib/ai/prompt-to-video-config";

const OPTIONS = { fps: 60, height: 720, width: 1280 };

describe("videoCatalog.toPrompt", () => {
  it("generates a non-empty prompt", () => {
    const prompt = videoCatalog.toPrompt(OPTIONS);
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("is idempotent", () => {
    const first = videoCatalog.toPrompt(OPTIONS);
    const second = videoCatalog.toPrompt(OPTIONS);
    expect(first).toBe(second);
  });

  it("includes all registered node types", () => {
    const prompt = videoCatalog.toPrompt(OPTIONS);

    expect(prompt).toContain("### rect");
    expect(prompt).toContain("### text");
    expect(prompt).toContain("### group");
    expect(prompt).toContain("### math");
    expect(prompt).toContain("### functionGraph");
    expect(prompt).toContain("### parametricGraph");
  });

  it("includes the three layout primitives", () => {
    const prompt = videoCatalog.toPrompt(OPTIONS);

    expect(prompt).toContain("### center");
    expect(prompt).toContain("### stack");
    expect(prompt).toContain("### align");
  });

  it("documents enum values for direction prop", () => {
    const prompt = videoCatalog.toPrompt(OPTIONS);
    expect(prompt).toContain('"vertical"');
    expect(prompt).toContain('"horizontal"');
  });

  it("includes layout guidance section", () => {
    const prompt = videoCatalog.toPrompt(OPTIONS);
    expect(prompt).toContain("Layout Guidance");
    expect(prompt).toContain("`center`");
    expect(prompt).toContain("`stack`");
    expect(prompt).toContain("`align`");
  });

  it("includes canvas dimensions in the prompt", () => {
    const prompt = videoCatalog.toPrompt(OPTIONS);
    expect(prompt).toContain("1280×720");
    expect(prompt).toContain("60fps");
  });
});

describe("videoCatalog.getSchema", () => {
  it("returns a schema that can parse valid AI output", () => {
    const schema = videoCatalog.getSchema();
    const result = schema.safeParse({
      scenes: [
        {
          duration: "2s",
          id: "s1",
          nodes: [],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects nodes that mix primitives with custom animation fields", () => {
    const schema = videoCatalog.getSchema();
    const result = schema.safeParse({
      scenes: [
        {
          duration: "2s",
          id: "s1",
          nodes: [
            {
              height: 100,
              id: "rect-1",
              initial: { opacity: 0 },
              primitives: ["FadeIn"],
              transition: { duration: "0.3s" },
              type: "rect",
              width: 100,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("accepts nodes that use only custom animation fields", () => {
    const schema = videoCatalog.getSchema();
    const result = schema.safeParse({
      scenes: [
        {
          duration: "2s",
          id: "s1",
          nodes: [
            {
              height: 100,
              id: "rect-1",
              initial: { opacity: 0, y: 20 },
              transition: { duration: "0.3s" },
              type: "rect",
              width: 100,
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects integer scene durations", () => {
    const schema = videoCatalog.getSchema();
    const result = schema.safeParse({
      scenes: [
        {
          duration: 120,
          id: "s1",
          nodes: [],
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("PROMPT_TO_VIDEO_SYSTEM_PROMPT", () => {
  it("is the catalog-generated prompt for default dimensions", () => {
    const generated = videoCatalog.toPrompt(OPTIONS);
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toBe(generated);
  });

  it("documents layout primitives", () => {
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("center");
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("stack");
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("align");
  });

  it("includes anchor values", () => {
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain('"top-left"');
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain('"center"');
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain('"bottom-right"');
  });

  it("documents seconds-based scene timing and the no-mixing rule", () => {
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain(
      "Express duration in seconds"
    );
    expect(PROMPT_TO_VIDEO_SYSTEM_PROMPT).toContain("Never use both together");
  });
});
