"use client";

import { usePlayground } from "./context";

export function JsonPanel() {
  const { selected, phase, pendingScene } = usePlayground();

  const scene = pendingScene ?? selected?.scene;
  const text = scene
    ? JSON.stringify(scene, null, 2)
    : // biome-ignore lint/style/noNestedTernary: <ok>
      phase === "planning"
      ? "// generating scene json..."
      : "// waiting...";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border/60 border-b px-4 py-2.5">
        <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
          scene json
        </span>
      </div>
      <pre className="flex-1 overflow-auto p-4 font-mono text-[11px] text-foreground/70 leading-5">
        {text}
      </pre>
    </div>
  );
}
