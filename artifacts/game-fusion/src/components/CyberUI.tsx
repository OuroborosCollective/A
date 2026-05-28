import React from "react";
import { cn } from "@/lib/utils";
import { motion, HTMLMotionProps } from "framer-motion";

interface CyberCardProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: 'cyan' | 'fuchsia';
}

export const CyberCard = ({ children, className, accent = 'cyan', ...props }: CyberCardProps) => {
  const isCyan = accent === 'cyan';
  return (
    <div 
      className={cn(
        "bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl overflow-hidden relative shadow-2xl",
        className
      )}
      {...props}
    >
      {/* Decorative cyber corners */}
      <div className={cn("absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 opacity-50", isCyan ? 'border-cyan-500' : 'border-fuchsia-500')} />
      <div className={cn("absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 opacity-50", isCyan ? 'border-cyan-500' : 'border-fuchsia-500')} />
      {children}
    </div>
  );
};

interface CyberButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  accent?: 'cyan' | 'fuchsia';
}

export const CyberButton = ({ children, className, accent = 'cyan', disabled, type = "button", ...props }: CyberButtonProps) => {
  const isCyan = accent === 'cyan';
  const baseColors = isCyan 
    ? "border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/20 hover:border-cyan-400 hover:shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:text-cyan-300"
    : "border-fuchsia-500/50 text-fuchsia-400 hover:bg-fuchsia-500/20 hover:border-fuchsia-400 hover:shadow-[0_0_20px_rgba(255,0,255,0.4)] hover:text-fuchsia-300";
    
  return (
    <button 
      type={type}
      className={cn(
        "relative px-6 py-3 font-display font-bold tracking-widest uppercase border bg-black/50 transition-all duration-300 outline-none",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-black/50 disabled:hover:shadow-none disabled:hover:border-white/10",
        baseColors,
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};

interface CyberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  accent?: 'cyan' | 'fuchsia';
}

export const CyberInput = ({ className, accent = 'cyan', ...props }: CyberInputProps) => {
  const isCyan = accent === 'cyan';
  const focusColors = isCyan 
    ? "focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 shadow-[inset_0_0_10px_rgba(0,240,255,0.05)]"
    : "focus:border-fuchsia-500 focus:ring-1 focus:ring-fuchsia-500/50 shadow-[inset_0_0_10px_rgba(255,0,255,0.05)]";

  return (
    <input 
      className={cn(
        "bg-black/60 border border-white/10 text-white placeholder:text-white/30 p-3 font-mono text-sm outline-none transition-all duration-300 rounded",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        focusColors,
        className
      )}
      {...props}
    />
  );
};
