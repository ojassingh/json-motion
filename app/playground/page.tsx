import { Navbar } from "@/components/navbar";
import { PreviewPanel } from "../_components/preview-panel";
import { PlaygroundProvider } from "./_components/context";
import { PromptInput } from "./_components/prompt-input";

export default function PlaygroundPage() {
  return (
    <>
      <Navbar />
      <PlaygroundProvider>
        <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
          <PromptInput />
          <div className="min-w-0 flex-1 p-4">
            <PreviewPanel page="playground" />
          </div>
        </div>
      </PlaygroundProvider>
    </>
  );
}
