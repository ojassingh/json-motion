import { Navbar } from "@/components/navbar";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { PlaygroundProvider } from "./_components/context";
import { PlaygroundPreviewPanels } from "./_components/preview-panels";
import { PromptInput } from "./_components/prompt-input";

export default function PlaygroundPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Navbar />
      <PlaygroundProvider>
        <ResizablePanelGroup className="flex-1">
          <ResizablePanel defaultSize={25} minSize={18}>
            <PromptInput />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={75} minSize={15}>
            <PlaygroundPreviewPanels />
          </ResizablePanel>
        </ResizablePanelGroup>
      </PlaygroundProvider>
    </div>
  );
}
