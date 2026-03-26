import { Navbar } from "@/components/navbar";
import { PlaygroundProvider } from "./_components/context";
import { PlaygroundPreviewPanels } from "./_components/preview-panels";
import { PromptInput } from "./_components/prompt-input";

export default function PlaygroundPage() {
  return (
    <>
      <Navbar />
      <PlaygroundProvider>
        <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
          <PromptInput />
          <div className="min-w-0 flex-1">
            <PlaygroundPreviewPanels />
          </div>
        </div>
      </PlaygroundProvider>
    </>
  );
}
