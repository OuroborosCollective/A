import { useState } from "react";
import { RepoPanel } from "@/components/RepoPanel";
import { FusionCenter } from "@/components/FusionCenter";
import type { RepoData, AnalysisResult } from "@workspace/api-client-react";

export type RepoState = {
  url: string;
  data: RepoData | null;
  analysis: AnalysisResult | null;
};

export default function Home() {
  const [gameA, setGameA] = useState<RepoState>({ url: '', data: null, analysis: null });
  const [gameB, setGameB] = useState<RepoState>({ url: '', data: null, analysis: null });

  return (
    <div className="min-h-screen w-full relative overflow-x-hidden font-sans pb-24 selection:bg-primary/30 selection:text-primary">
      {/* Immersive Dark Background */}
      <div className="fixed inset-0 z-[-2] bg-background">
        <img 
          src={`${import.meta.env.BASE_URL}images/tech-bg.png`} 
          alt="Cyber Environment" 
          className="w-full h-full object-cover opacity-30 mix-blend-screen pointer-events-none" 
        />
      </div>
      {/* Fade overlay to guarantee contrast */}
      <div className="fixed inset-0 z-[-1] bg-gradient-to-b from-background/40 via-background/80 to-background pointer-events-none" />

      {/* Header section */}
      <header className="w-full pt-16 pb-12 text-center relative z-10">
        <h1 className="text-5xl md:text-7xl font-display font-bold tracking-[0.1em] text-white drop-shadow-[0_0_20px_rgba(0,240,255,0.6)]">
          GAME FUSION <span className="text-primary">DOCK</span>
        </h1>
        <p className="text-muted-foreground font-mono mt-4 tracking-widest text-sm uppercase flex items-center justify-center gap-4">
          <span className="w-12 h-px bg-white/20"></span>
          Neural Engine Protocol v1.0.0
          <span className="w-12 h-px bg-white/20"></span>
        </p>
      </header>

      {/* Main Content Layout */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col gap-16 relative z-10">
        
        {/* Docking Panels Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 relative">
          
          {/* Cyber connector line (desktop only) */}
          <div className="hidden lg:block absolute top-[40%] left-[25%] right-[25%] h-1 bg-gradient-to-r from-cyan-500/20 via-primary/50 to-fuchsia-500/20 z-0 blur-[2px]"></div>
          <div className="hidden lg:block absolute top-[40%] left-[25%] right-[25%] h-px bg-gradient-to-r from-cyan-400 via-primary to-fuchsia-400 z-0"></div>

          <RepoPanel
            title="GAME A - GRAPHICS"
            role="graphics"
            accent="cyan"
            state={gameA}
            onStateChange={setGameA}
          />

          <RepoPanel
            title="GAME B - LOGIC"
            role="logic"
            accent="fuchsia"
            state={gameB}
            onStateChange={setGameB}
          />
        </div>

        {/* Action Center */}
        <FusionCenter gameA={gameA} gameB={gameB} />
        
      </main>
    </div>
  );
}
