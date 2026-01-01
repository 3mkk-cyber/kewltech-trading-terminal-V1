import { useBatchAnalysis } from "@/hooks/use-analysis";
import { SymbolGrid } from "@/components/SymbolGrid";
import { BotSignalsPanel } from "@/components/BotSignalsPanel";
import { BotPatternsPanel } from "@/components/BotPatternsPanel";
import { OpenTradesPanel } from "@/components/OpenTradesPanel";
import { TradeHistoryPanel } from "@/components/TradeHistoryPanel";
import { TrendingUp, Zap, Cpu, AlertTriangle, TrendingDown } from "lucide-react";
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
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 lg:p-8 font-sans selection:bg-primary/20">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-3xl md:text-4xl text-foreground font-display tracking-tight flex items-center gap-2">
                <Zap className="w-6 h-6 text-primary fill-primary/20" />
                KEWLTECH<span className="text-muted-foreground">TERMINAL</span>
              </h1>
              <div className="px-2 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary border border-primary/20 uppercase tracking-widest">
                v2.0 Beta
              </div>
            </div>
            <p className="text-muted-foreground font-mono text-xs md:text-sm">
              AI-POWERED MULTI-SYMBOL TECHNICAL ANALYSIS • 6 ACTIVE MARKETS
            </p>
          </div>

          {primaryAnalysis && (
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-sm text-muted-foreground font-mono mb-1">
                  PRIMARY PRICE
                </div>
                {isLoading ? (
                  <div className="h-10 w-32 bg-muted animate-pulse rounded" />
                ) : (
                  <div
                    className={cn(
                      "text-3xl md:text-4xl font-mono font-bold tracking-tighter",
                      isBullish
                        ? "text-green-500"
                        : isBearish
                          ? "text-red-500"
                          : "text-foreground",
                    )}
                  >
                    ${primaryAnalysis?.price?.toFixed(2) || "Loading..."}
                  </div>
                )}
              </div>
              <div
                className={cn(
                  "hidden md:flex flex-col items-center justify-center w-24 h-24 rounded-2xl border-2 backdrop-blur-sm",
                  isBullish
                    ? "bg-green-500/5 border-green-500/30"
                    : isBearish
                      ? "bg-red-500/5 border-red-500/30"
                      : "bg-muted/5 border-muted",
                )}
              >
                <span className="text-[10px] font-mono uppercase text-muted-foreground mb-1">
                  TREND
                </span>
                <span
                  className={cn(
                    "font-display font-bold text-lg",
                    isBullish
                      ? "text-green-500"
                      : isBearish
                        ? "text-red-500"
                        : "text-foreground",
                  )}
                >
                  {primaryAnalysis?.indicators?.trend || "NEUTRAL"}
                </span>
              </div>
            </div>
          )}
        </header>

        {/* Symbol Grid Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              LIVE MARKET ANALYSIS
            </h2>
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              STREAMING DATA
            </div>
          </div>
          <SymbolGrid />
        </section>

        {/* Bot Panels Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Bot Signals */}
          <div className="lg:col-span-6 space-y-3">
            <h2 className="text-sm text-muted-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4" /> Trade Signals
            </h2>
            <div className="bg-card/30 rounded-xl p-4 border border-border/50">
              <BotSignalsPanel />
            </div>
          </div>

          {/* Bot Patterns */}
          <div className="lg:col-span-6 space-y-3">
            <h2 className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Pattern Detection
            </h2>
            <div className="bg-card/30 rounded-xl p-4 border border-border/50">
              <BotPatternsPanel />
            </div>
          </div>
        </div>

        {/* Trade History Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-primary" />
              PAPER TRADING RESULTS
            </h2>
          </div>
          <div className="bg-card/30 rounded-xl p-4 border border-border/50">
            <TradeHistoryPanel />
          </div>
        </section>

        {/* Open Trades Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-display flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-yellow-500" />
              ACTIVE POSITIONS
            </h2>
          </div>
          <div className="bg-card/30 rounded-xl p-4 border border-border/50">
            <OpenTradesPanel />
          </div>
        </section>
      </div>
    </div>
  );
}
