import { useState, useEffect } from "react";
import { CyberButton, CyberCard } from "./CyberUI";
import { useFuseGames, useDownloadFusedGame } from "@/hooks/use-fusion";
import { Loader2, Download, Zap, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { motion, AnimatePresence } from "framer-motion";
import { RepoState } from "@/pages/Home";
import type { FusionResult } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

const LOADING_MESSAGES = [
  "Aligning world geometries...",
  "Transpiling physics hooks...",
  "Bridging render context...",
  "Resolving asset references...",
  "Synthesizing hybrid runtime...",
  "Generating final manifests..."
];

interface FusionCenterProps {
  gameA: RepoState;
  gameB: RepoState;
}

export function FusionCenter({ gameA, gameB }: FusionCenterProps) {
  const [fusionResult, setFusionResult] = useState<FusionResult | null>(null);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const { toast } = useToast();
  
  const { mutate: fuseGames, isPending: isFusing } = useFuseGames();
  const { mutateAsync: downloadGame, isPending: isDownloading } = useDownloadFusedGame();

  const isReady = gameA.analysis && gameB.analysis;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isFusing) {
      interval = setInterval(() => {
        setLoadingMsgIdx(i => (i + 1) % LOADING_MESSAGES.length);
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isFusing]);

  const handleFuse = () => {
    if (!gameA.data || !gameA.analysis || !gameB.data || !gameB.analysis) return;

    fuseGames({
      data: {
        gameA: { repoData: gameA.data, analysis: gameA.analysis },
        gameB: { repoData: gameB.data, analysis: gameB.analysis }
      }
    }, {
      onSuccess: (res) => {
        setFusionResult(res);
        toast({ title: "Synthesis Complete", description: "Hybrid source generated successfully." });
      },
      onError: (err: any) => toast({ title: "Synthesis Failed", description: err.message, variant: 'destructive' })
    });
  };

  const handleDownload = async () => {
    if (!fusionResult || !gameA.data || !gameB.data) return;
    try {
      const blob = await downloadGame({
        data: {
          fusionResult,
          gameAName: gameA.data.repo,
          gameBName: gameB.data.repo
        }
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fusion-${gameA.data.repo}-${gameB.data.repo}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: "Export Failed", description: err.message, variant: 'destructive' });
    }
  };

  if (fusionResult) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }} 
        animate={{ opacity: 1, scale: 1, y: 0 }} 
        className="w-full max-w-5xl mx-auto z-20"
      >
        <CyberCard accent="cyan" className="p-8 md:p-12 border-primary/50 shadow-[0_0_60px_rgba(0,240,255,0.15)] flex flex-col items-center text-center">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
            className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-8 shadow-[0_0_40px_rgba(0,240,255,0.5)]"
          >
            <CheckCircle2 size={48} className="text-primary" />
          </motion.div>
          <h2 className="text-4xl md:text-5xl font-display font-bold uppercase tracking-widest text-white mb-4">Fusion Complete</h2>
          <div className="flex items-center gap-4 mb-6 text-xs font-mono tracking-widest uppercase">
            <span className="text-cyan-400">Graphical Overlay: {gameA.data?.repo}</span>
            <span className="text-white/20">|</span>
            <span className="text-fuchsia-400">Logical Structure: {gameB.data?.repo}</span>
          </div>
          <p className="text-muted-foreground font-mono max-w-3xl mb-10 leading-relaxed text-sm md:text-base">{fusionResult.summary}</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full mb-10 text-left">
             <div className="bg-black/60 border border-white/10 p-6 rounded-xl flex flex-col justify-center">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-mono text-primary font-bold uppercase flex items-center gap-2">
                    <Zap size={18}/> Compatibility Index
                  </h3>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-primary/50 hover:text-primary transition-colors focus:outline-none" aria-label="About compatibility index">
                        <Info size={16} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>AI-calculated alignment between graphics and logic layers based on asset types, engine requirements, and file structures.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-6">
                   <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                     <svg className="w-full h-full transform -rotate-90">
                       <circle cx="48" cy="48" r="42" className="stroke-white/10" strokeWidth="8" fill="none" />
                       <circle 
                         cx="48" 
                         cy="48" 
                         r="42" 
                         className="stroke-primary" 
                         strokeWidth="8" 
                         fill="none" 
                         strokeDasharray={`${fusionResult.compatibilityScore * 2.64} 264`} 
                       />
                     </svg>
                     <span className="absolute text-2xl font-display font-bold text-white drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">{fusionResult.compatibilityScore}%</span>
                   </div>
                   <div className="flex-1">
                     <p className="text-sm text-white/80 font-mono leading-relaxed">
                       {fusionResult.compatibilityScore > 80 ? "Optimal alignment. Expected to compile smoothly." : 
                        fusionResult.compatibilityScore > 50 ? "Moderate alignment. Expect minor visual/logic clipping." :
                        "Poor alignment. Significant manual refactoring required post-download."}
                     </p>
                   </div>
                </div>
             </div>
             
             <div className="bg-black/60 border border-white/10 p-6 rounded-xl flex flex-col max-h-[220px]">
                <h3 className="text-sm font-mono text-yellow-500 font-bold uppercase mb-4 flex items-center gap-2"><AlertTriangle size={18}/> Compiler Warnings</h3>
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-3 space-y-2">
                  {fusionResult.warnings.length === 0 ? (
                    <span className="text-sm text-white/50 font-mono italic">No critical divergence detected.</span>
                  ) : (
                    fusionResult.warnings.map((w, i) => (
                      <div key={i} className="text-xs text-yellow-500/80 font-mono border-l-2 border-yellow-500/50 pl-3 py-1 bg-yellow-500/5">{w}</div>
                    ))
                  )}
                </div>
             </div>
          </div>
          
          <CyberButton 
            accent="cyan" 
            className="text-xl px-12 py-6 w-full md:w-auto flex items-center justify-center gap-4"
            onClick={handleDownload}
            disabled={isDownloading}
            aria-label={isDownloading ? "Preparing your hybrid game download..." : "Download the compiled hybrid game archive"}
          >
            {isDownloading ? <Loader2 className="animate-spin" size={28} /> : <Download size={28} />}
            {isDownloading ? "PACKAGING ARCHIVE..." : "DOWNLOAD COMPILED HYBRID (ZIP)"}
          </CyberButton>
        </CyberCard>
      </motion.div>
    );
  }

  return (
    <div className="w-full flex flex-col items-center justify-center py-20 relative min-h-[400px]">
       {/* Ambient glowing core overlay behind the button */}
       <AnimatePresence>
         {isReady && !fusionResult && (
           <motion.div 
             initial={{ opacity: 0, scale: 0.8 }}
             animate={{ opacity: 0.5, scale: 1 }}
             exit={{ opacity: 0 }}
             className="absolute inset-0 pointer-events-none flex items-center justify-center mix-blend-screen z-0"
           >
              <img 
                src={`${import.meta.env.BASE_URL}images/fusion-core.png`} 
                alt="Glowing Core" 
                className={`w-[500px] h-[500px] object-cover transition-all duration-[2000ms] ${isFusing ? 'scale-125 saturate-200 rotate-180 opacity-80' : 'scale-100 opacity-50 hover:opacity-70'}`} 
              />
           </motion.div>
         )}
       </AnimatePresence>
       
       <button
         onClick={handleFuse}
         disabled={!isReady || isFusing}
         aria-live="polite"
         aria-label={
           !isReady ? "Awaiting data to initiate fusion" :
           isFusing ? `Fusion in progress: ${LOADING_MESSAGES[loadingMsgIdx]}` :
           "Initiate Fusion between graphics and logic repositories"
         }
         className={cn(
           "relative z-10 w-72 h-72 rounded-full border-[6px] flex items-center justify-center flex-col gap-4 transition-all duration-700 backdrop-blur-xl shadow-2xl outline-none",
           "focus-visible:ring-4 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-background",
           !isReady ? "border-white/10 bg-black/60 text-white/30 cursor-not-allowed" :
           isFusing ? "border-primary bg-primary/10 text-white shadow-[0_0_150px_rgba(0,240,255,0.7)] cursor-wait" :
           "border-white/30 bg-black/80 text-white hover:border-primary hover:bg-primary/5 hover:shadow-[0_0_80px_rgba(0,240,255,0.5)] cursor-pointer hover:scale-105"
         )}
       >
         {isFusing ? (
           <AnimatePresence mode="wait">
             <motion.div 
               key={loadingMsgIdx}
               initial={{ opacity: 0, y: 15 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: -15 }}
               transition={{ duration: 0.5 }}
               className="text-primary font-mono text-sm px-10 text-center tracking-wide"
             >
               <Loader2 className="animate-spin mx-auto mb-4" size={32} />
               {LOADING_MESSAGES[loadingMsgIdx]}
             </motion.div>
           </AnimatePresence>
         ) : (
           <>
             <Zap size={64} className={isReady ? "text-primary animate-pulse" : "opacity-30"} />
             <span className={cn(
               "font-display font-bold text-3xl tracking-[0.2em] uppercase text-center leading-tight",
               !isReady && "opacity-50"
             )}>
               {isReady ? (
                 <>INITIATE<br/><span className="text-primary drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">FUSION</span></>
               ) : !gameA.data || !gameB.data ? (
                 <>LINK<br/>REPOS</>
               ) : (
                 <>ANALYZE<br/>CORES</>
               )}
             </span>
           </>
         )}
       </button>
    </div>
  );
}
