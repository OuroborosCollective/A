import { CyberButton, CyberInput, CyberCard } from "./CyberUI";
import { TerminalDisplay } from "./TerminalDisplay";
import { useFetchRepo, useAnalyzeRepo } from "@/hooks/use-fusion";
import { RepoState } from "@/pages/Home";
import { Loader2, GitBranch, FolderGit2, Cpu, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RepoPanelProps {
  title: string;
  role: 'graphics' | 'logic';
  accent: 'cyan' | 'fuchsia';
  state: RepoState;
  onStateChange: (state: RepoState) => void;
}

export function RepoPanel({ title, role, accent, state, onStateChange }: RepoPanelProps) {
  const isCyan = accent === 'cyan';
  const colorClass = isCyan ? 'text-cyan-400' : 'text-fuchsia-400';
  const bgGlow = isCyan ? 'shadow-[0_0_40px_rgba(0,240,255,0.05)]' : 'shadow-[0_0_40px_rgba(255,0,255,0.05)]';
  const { toast } = useToast();

  const { mutate: fetchRepo, isPending: isFetching } = useFetchRepo();
  const { mutate: analyzeRepo, isPending: isAnalyzing } = useAnalyzeRepo();

  const handleFetch = () => {
    if (!state.url) return;
    fetchRepo({ data: { repoUrl: state.url } }, {
      onSuccess: (data) => onStateChange({ ...state, data, analysis: null }),
      onError: (err: any) => toast({ title: "Fetch Failed", description: err.message || "Could not retrieve repository", variant: 'destructive' })
    });
  };

  const handleAnalyze = () => {
    if (!state.data) return;
    analyzeRepo({ data: { repoData: state.data, role } }, {
      onSuccess: (analysis) => onStateChange({ ...state, analysis }),
      onError: (err: any) => toast({ title: "Analysis Failed", description: err.message || "Failed to classify files", variant: 'destructive' })
    });
  };

  return (
    <CyberCard accent={accent} className={`relative z-10 flex flex-col gap-6 p-6 md:p-8 ${bgGlow}`}>
      {/* Header */}
      <div className={`border-b-2 pb-4 flex items-center gap-4 ${isCyan ? 'border-cyan-500/30' : 'border-fuchsia-500/30'}`}>
        <div className={`p-3 rounded-xl bg-black/60 border border-white/5 ${colorClass}`}>
          {role === 'graphics' ? <ImageIcon size={28} /> : <Cpu size={28} />}
        </div>
        <h2 className={`text-2xl md:text-3xl font-display font-bold tracking-widest uppercase ${colorClass} drop-shadow-md`}>
          {title}
        </h2>
      </div>

      {/* Input Area */}
      <div className="flex flex-col gap-3">
        <label
          htmlFor={`repo-url-${role}`}
          className="text-xs font-mono text-muted-foreground uppercase tracking-wider pl-1"
        >
          GitHub Repository Target
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <CyberInput
            id={`repo-url-${role}`}
            accent={accent}
            value={state.url}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onStateChange({ ...state, url: e.target.value })}
            placeholder="https://github.com/username/game-repo"
            className="flex-1"
          />
          <CyberButton
            accent={accent}
            onClick={handleFetch}
            disabled={isFetching || !state.url}
            aria-label={isFetching ? "Connecting to repository..." : "Initiate repository link"}
          >
            {isFetching ? <Loader2 className="animate-spin h-5 w-5" /> : "Initiate Link"}
          </CyberButton>
        </div>
      </div>

      {/* Fetched State (Tree Preview) */}
      {state.data && !state.analysis && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="flex flex-col gap-5 mt-4"
        >
          <div className="flex flex-wrap items-center justify-between text-sm font-mono text-muted-foreground bg-black/60 p-4 rounded-lg border border-white/5 gap-3">
            <span className="flex items-center gap-2 text-white"><FolderGit2 size={16} className={colorClass}/> {state.data.owner}/{state.data.repo}</span>
            <span className="flex items-center gap-2"><GitBranch size={16} className={colorClass}/> {state.data.defaultBranch}</span>
          </div>
          {state.data.description && <p className="text-sm text-white/70 pl-1">{state.data.description}</p>}

          <TerminalDisplay
            accent={accent}
            title={`Files Detected: ${state.data.totalFiles} (showing first 100)`}
            items={state.data.files.slice(0, 100).map(f => (
              <div key={f.path} className="flex justify-between w-full opacity-70 hover:opacity-100 py-0.5 transition-opacity">
                <span className="truncate pr-4 leading-relaxed">{f.path}</span>
                <span className="shrink-0 leading-relaxed text-white/40">{f.size} B</span>
              </div>
            ))}
          />

          <CyberButton
            accent={accent}
            className="w-full mt-4 text-lg py-4"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            aria-label={isAnalyzing ? "Analyzing repository structure..." : "Initialize AI repository analysis"}
          >
            {isAnalyzing ? (
              <span className="flex items-center gap-3 justify-center"><Loader2 className="animate-spin"/> Executing Deep Scan...</span>
            ) : (
              "Initialize AI Analysis"
            )}
          </CyberButton>
        </motion.div>
      )}

      {/* Analyzed State */}
      {state.analysis && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="flex flex-col gap-6 mt-2"
        >
          <div className={`p-5 rounded-lg border bg-black/60 ${isCyan ? 'border-cyan-500/30' : 'border-fuchsia-500/30'}`}>
            <h3 className={`text-sm font-mono font-bold uppercase mb-3 flex items-center gap-2 ${colorClass}`}>
              <div className="w-2 h-2 rounded-full bg-current animate-pulse"/>
              Architecture Summary
            </h3>
            <p className="text-sm text-white/90 mb-5 leading-relaxed">{state.analysis.architecture.summary}</p>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="bg-black/80 p-3 rounded-md border border-white/5">
                <span className="text-muted-foreground block mb-1">Engine</span>
                <span className="text-white text-sm">{state.analysis.architecture.renderingEngine || "Unknown"}</span>
              </div>
              <div className="bg-black/80 p-3 rounded-md border border-white/5">
                <span className="text-muted-foreground block mb-1">Genre</span>
                <span className="text-white text-sm">{state.analysis.architecture.gameGenre || "Unknown"}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
             <StatCard
               title="Visual Payload"
               count={state.analysis.architecture.visualFiles.length}
               accent={accent}
               description="Count of shaders, textures, and models"
             />
             <StatCard
               title="Logic Nodes"
               count={state.analysis.architecture.logicFiles.length}
               accent={accent}
               description="Count of scripts and core logic files"
             />
             <StatCard
               title="Asset Pack"
               count={state.analysis.architecture.assetFiles.length}
               accent={accent}
               description="Count of audio files and static resources"
             />
          </div>

          {state.analysis.warnings.length > 0 && (
            <div className="bg-red-950/20 border border-red-500/30 p-4 rounded-lg">
              <h4 className="text-red-400 text-xs font-bold uppercase font-mono mb-2">Compatibility Warnings</h4>
              <ul className="text-red-300/80 text-xs font-mono list-disc pl-4 space-y-1.5">
                {state.analysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          <div className={`text-center font-display font-bold tracking-widest text-xl py-3 border-y border-dashed ${isCyan ? 'text-cyan-500 border-cyan-500/30 bg-cyan-950/20' : 'text-fuchsia-500 border-fuchsia-500/30 bg-fuchsia-950/20'}`}>
            SYSTEM LINK ESTABLISHED
          </div>
        </motion.div>
      )}
    </CyberCard>
  );
}

function StatCard({ title, count, accent, description }: { title: string, count: number, accent: string, description?: string }) {
  const isCyan = accent === 'cyan';
  const content = (
    <div className={`p-4 rounded-lg border text-center flex flex-col items-center justify-center bg-black/60 shadow-inner h-full w-full ${isCyan ? 'border-cyan-900/50' : 'border-fuchsia-900/50'}`}>
      <span className={`text-3xl font-display font-bold mb-1 ${isCyan ? 'text-cyan-400 drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]' : 'text-fuchsia-400 drop-shadow-[0_0_8px_rgba(255,0,255,0.8)]'}`}>{count}</span>
      <span className="text-[10px] sm:text-xs font-mono uppercase text-muted-foreground">{title}</span>
    </div>
  );

  if (!description) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help h-full w-full">
          {content}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs font-mono">{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
