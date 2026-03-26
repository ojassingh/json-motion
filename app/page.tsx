import { Navbar } from "@/components/navbar";
import { HomeProvider } from "./_components/context";
import { Hero } from "./_components/hero";
import { PreviewPanel } from "./_components/preview-panel";
import { PromptForm } from "./_components/prompt-form";

export default function Page() {
  return (
    <>
      <Navbar />
      <HomeProvider>
        <main className="mx-auto max-w-5xl px-6 py-20">
          <section
            className="flex flex-col items-center gap-10"
            id="playground"
          >
            <Hero />
            <PromptForm />
            <PreviewPanel page="home" />
          </section>
        </main>
      </HomeProvider>
    </>
  );
}
