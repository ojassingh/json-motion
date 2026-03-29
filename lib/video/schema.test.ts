import { describe, expect, test } from "bun:test";

import { videoDescriptionSchema } from "@/lib/video/schema";

const baseDescription = {
  background: "#000000",
  fps: 60,
  height: 180,
  scenes: [
    {
      duration: 30,
      id: "scene-1",
      nodes: {},
      startFrame: 0,
      timeline: [],
    },
  ],
  width: 320,
};

describe("videoDescriptionSchema", () => {
  test("rejects unsupported image nodes", () => {
    const result = videoDescriptionSchema.safeParse({
      ...baseDescription,
      scenes: [
        {
          ...baseDescription.scenes[0],
          nodes: {
            image: {
              height: 80,
              src: "https://example.com/image.png",
              type: "image",
              width: 120,
            },
          },
        },
      ],
    });

    expect(result.success).toBeFalse();
    if (result.success) {
      throw new Error("expected schema failure");
    }
    expect(result.error.issues.length).toBeGreaterThan(0);
  });
});
