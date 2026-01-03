import { useBatchAnalysis } from "@/hooks/use-analysis";
import { SymbolGrid } from "@/components/SymbolGrid";
import { BotSignalsPanel } from "@/components/BotSignalsPanel";
import { BotPatternsPanel } from "@/components/BotPatternsPanel";
import { OpenTradesPanel } from "@/components/OpenTradesPanel";
import { ActiveTradesPanel } from "@/components/ActiveTradesPanel";
import { TradeHistoryPanel } from "@/components/TradeHistoryPanel";
import { TrendingUp, Zap, Cpu, AlertTriangle, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { data: analyses, isLoading, error } = useBatchAnalysis();

  // Get first symbol data for header (primary symbol)
  const primaryAnalysis =
    analyses && analyses.length > 0 ? analyses[0] : null;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-red-500 font-mono">
        Error connecting to market data stream. Please check your connection.
      </div>
    );
  }

  const isBullish = primaryAnalysis?.indicators?.trend === "bullish";
  const isBearish = primaryAnalysis?.indicators?.trend === "bearish";

  return (
    <div className="min-h-screen bg-background text-foreground p-2 md:p-4 font-sans selection:bg-primary/20">
      <div className="max-w-[1800px] mx-auto space-y-3">
        {/* Compact Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-xl md:text-2xl text-foreground font-display tracking-tight flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary fill-primary/20" />
                DEPTHSIGNALS<span className="text-muted-foreground text-lg">TERMINAL</span>
              </h1>
              <div className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
                v2.0
              </div>
            </div>
            <p className="text-muted-foreground font-mono text-[10px] md:text-xs">
              AI-POWERED ANALYSIS • 6 MARKETS • LIVE
            </p>
          </div>

          {primaryAnalysis && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] text-muted-foreground font-mono mb-0.5">
                  BTC PRICE
                </div>
                {isLoading ? (
                  <div className="h-8 w-24 bg-muted animate-pulse rounded" />
                ) : (
                  <div
                    className={cn(
                      "text-2xl md:text-3xl font-mono font-bold tracking-tighter",
                      isBullish
                        ? "text-green-500"
                        : isBearish
                          ? "text-red-500"
                          : "text-foreground",
                    )}
                  >
                    ${primaryAnalysis?.price?.toFixed(2) || "..."}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "flex flex-col items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-xl border backdrop-blur-sm",
                  isBullish
                    ? "bg-green-500/5 border-green-500/30"
                    : isBearish
                      ? "bg-red-500/5 border-red-500/30"
                      : "bg-muted/5 border-muted",
                )}
              >
                <span className="text-[8px] font-mono uppercase text-muted-foreground mb-0.5">
                  TREND
                </span>
                <span
                  className={cn(
                    "font-display font-bold text-sm md:text-base",
                    isBullish
                      ? "text-green-500"
                      : isBearish
                        ? "text-red-500"
                        : "text-foreground",
                  )}
                >
                  {primaryAnalysis?.indicators?.trend?.toUpperCase() || "NEUTRAL"}
                </span>
              </div>
            </div>
          )}
        </header>

        {/* Compact Symbol Grid */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-display flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              LIVE MARKETS
            </h2>
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              LIVE
            </div>
          </div>
          <SymbolGrid />
        </section>

        {/* Compact 3-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Active Trades - Now Collapsible */}
          <div className="bg-card/30 rounded-lg border border-border/50 overflow-hidden">
            <ActiveTradesPanel />
          </div>

          {/* Bot Signals */}
          <div className="bg-card/30 rounded-lg border border-border/50 overflow-hidden">
            <div className="p-3 border-b border-border/50">
              <h3 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Cpu className="w-3.5 h-3.5" /> SIGNALS (TOP 20)
              </h3>
            </div>
            <div className="p-3">
              <BotSignalsPanel />
            </div>
          </div>

          {/* Bot Patterns */}
          <div className="bg-card/30 rounded-lg border border-border/50 overflow-hidden">
            <div className="p-3 border-b border-border/50">
              <h3 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5" /> PATTERNS
              </h3>
            </div>
            <div className="p-3">
              <BotPatternsPanel />
            </div>
          </div>
        </div>

        {/* Performance Dashboard - 2 Column */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-card/30 rounded-lg border border-border/50 overflow-hidden">
            <OpenTradesPanel />
          </div>
          <div className="bg-card/30 rounded-lg border border-border/50 overflow-hidden">
            <TradeHistoryPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
