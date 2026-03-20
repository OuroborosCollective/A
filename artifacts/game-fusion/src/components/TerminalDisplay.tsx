import { cn } from "@/lib/utils";
import React from "react";

interface TerminalDisplayProps {
  title: string;
  items: React.ReactNode[];
  className?: string;
  accent?: 'cyan' | 'fuchsia';
}

export const TerminalDisplay = ({ title, items, className, accent = 'cyan' }: TerminalDisplayProps) => {
  const isCyan = accent === 'cyan';
  
  return (
    <div className={cn(
      "border bg-black/80 rounded-md overflow-hidden flex flex-col font-mono text-xs relative",
      isCyan ? "border-cyan-900/50" : "border-fuchsia-900/50",
      className
    )}>
      {/* Header bar */}
      <div className={cn(
        "px-3 py-2 border-b uppercase tracking-widest font-bold flex items-center gap-2 text-[10px]",
        isCyan ? "border-cyan-900/50 bg-cyan-950/30 text-cyan-400" : "border-fuchsia-900/50 bg-fuchsia-950/30 text-fuchsia-400"
      )}>
        <div className={cn("w-2 h-2 rounded-full animate-pulse", isCyan ? "bg-cyan-500" : "bg-fuchsia-500")} />
        {title}
      </div>
      
      {/* Content area */}
      <div className="h-56 overflow-y-auto p-3 space-y-1 relative group custom-scrollbar">
        {/* CRT Scanline overlay effect */}
        <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.3)_51%)] bg-[length:100%_4px] opacity-60 mix-blend-overlay z-20" />
        
        <div className={cn("relative z-10 w-full flex flex-col", isCyan ? "text-cyan-500/80" : "text-fuchsia-500/80")}>
          {items.map((item, idx) => (
            <div key={idx} className="w-full">
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
