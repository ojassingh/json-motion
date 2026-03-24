# Motion

Motion is a deterministic, agent-native video engine built on Next.js. A render request describes scenes, nodes, transforms, and animations as plain data. The server resolves each frame with a pure animation layer, rasterizes it through `skia-canvas`, and streams raw RGBA frames into `ffmpeg` to produce an MP4.

## Prerequisites

- Bun
- A local `ffmpeg` binary available on your `PATH`
- macOS Metal support if you want the default `h264_videotoolbox` hardware encoder

You can verify `ffmpeg` is installed with:

```bash
ffmpeg -version
```

## Development

```bash
bun install
bun run dev
```

## Render API

`POST /api/render`

Example request body:

```tsx
{
  "width": 640,
  "height": 360,
  "fps": 12,
  "background": "#07111f",
  "scenes": [
    {
      "id": "intro",
      "startFrame": 0,
      "durationInFrames": 24,
      "background": "#07111f",
      "nodes": [
        {
          "id": "card",
          "type": "rect",
          "width": 544,
          "height": 220,
          "radius": 24,
          "fill": "#0f172a",
          "transform": {
            "x": 48,
            "y": 72
          }
        },
        {
          "id": "headline",
          "type": "text",
          "text": "Deterministic video",
          "fontSize": 42,
          "transform": {
            "x": 88,
            "y": 112
          },
          "animations": [
            {
              "type": "effect",
              "name": "fade-in",
              "startFrame": 0,
              "endFrame": 10
            }
          ]
        }
      ]
    }
  ]
}
```

Example `curl`:

```bash
curl -X POST http://localhost:3000/api/render \
  -H "Content-Type: application/json" \
  -d @request.json
```

Successful responses return a job id, output metadata, and a URL such as `/renders/<job-id>.mp4`.

## Local fixture

A sample render request lives at `lib/video/fixtures/sample-video-description.ts`.

Render it locally:

```bash
bun run render:fixture
```

## Tests and checks

```bash
bun test
bun run typecheck
bun x ultracite check
```
