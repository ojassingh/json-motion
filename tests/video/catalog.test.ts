import { describe, expect, it } from "bun:test";
import {
  PROMPT_TO_VIDEO_SYSTEM_PROMPT,
  videoCatalog,
} from "@/lib/ai/prompt-to-video-config";

const OPTIONS = { fps: 60, height: 540, width: 960 };

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
    expect(prompt).toContain("960×540");
    expect(prompt).toContain("60fps");
  });
});

describe("videoCatalog.getSchema", () => {
  it("returns a schema that can parse a valid video description", () => {
    const schema = videoCatalog.getSchema();
    const result = schema.safeParse({
      fps: 60,
      height: 540,
      scenes: [
        {
          duration: 60,
          id: "s1",
          nodes: [],
          startFrame: 0,
        },
      ],
      width: 960,
    });
    expect(result.success).toBe(true);
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
});
