import { Navbar } from "@/components/navbar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PlaygroundProvider } from "./_components/context";
import { JsonPanel } from "./_components/json-panel";
import { PromptInput } from "./_components/prompt-input";
import { VideoPanel } from "./_components/video-panel";

export default function PlaygroundPage() {
  return (
    <>
      <Navbar />
      <PlaygroundProvider>
        <div className="flex h-[calc(100vh-3rem)] overflow-hidden">
          <PromptInput />
          <ResizablePanelGroup>
            <ResizablePanel defaultSize={35} minSize={20}>
              <JsonPanel />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={65} minSize={30}>
              <VideoPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </PlaygroundProvider>
    </>
  );
}
