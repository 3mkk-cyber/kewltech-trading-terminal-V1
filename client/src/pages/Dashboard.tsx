import { useLiveAnalysis, useAnalysisHistory } from "@/hooks/use-analysis";
import { IndicatorCard } from "@/components/IndicatorCard";
import { PriceChart } from "@/components/PriceChart";
import { format } from "date-fns";
import { KewltechAnalysis } from "@shared/schema";
import {
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  BarChart2,
  Layers,
  RefreshCcw,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const DEFAULT_SYMBOL = "BTCUSDT";

export default function Dashboard() {
  const { data: analysis, isLoading, error } = useLiveAnalysis(DEFAULT_SYMBOL);
  const { data: history, isLoading: historyLoading } =
    useAnalysisHistory(DEFAULT_SYMBOL);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-red-500 font-mono">
        Error connecting to market data stream. Please check your connection.
      </div>
    );
  }

  // Use analysis data if available, even if history fails
  const isBullish = analysis?.indicators?.trend === "bullish";
  const isBearish = analysis?.indicators?.trend === "bearish";

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 lg:p-8 font-sans selection:bg-primary/20">
      <div className="max-w-7xl mx-auto space-y-6">
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
              AI-POWERED TECHNICAL ANALYSIS MODULE • {DEFAULT_SYMBOL}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-sm text-muted-foreground font-mono mb-1">
                CURRENT PRICE
              </div>
              {isLoading ? (
                <div className="h-10 w-32 bg-muted animate-pulse rounded" />
              ) : (
                <div
                  className={cn(
                    "text-3xl md:text-4xl font-mono font-bold tracking-tighter flex items-center justify-end gap-2",
                    isBullish
                      ? "text-green-500 text-glow-green"
                      : isBearish
                        ? "text-red-500 text-glow-red"
                        : "text-foreground",
                  )}
                >
                  {isBullish && <ArrowUpRight className="w-8 h-8" />}
                  {isBearish && <ArrowDownRight className="w-8 h-8" />}$
                  {analysis?.price || "Loading..."}
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
                {analysis?.indicators?.trend || "NEUTRAL"}
              </span>
            </div>
          </div>
        </header>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Chart & Summary (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Chart */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm text-muted-foreground flex items-center gap-2">
                  <Activity className="w-4 h-4" /> Live Market Action
                </h2>
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  LIVE FEED
                </div>
              </div>
              <PriceChart data={history} isLoading={historyLoading} />
            </section>

            {/* AI Summary */}
            <section className="bg-card/30 rounded-xl p-6 border border-border/50">
              <h2 className="text-sm text-muted-foreground font-mono mb-3 uppercase">
                Analysis Summary
              </h2>
              {isLoading ? (
                <div className="space-y-2">
                  <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-1/2 bg-muted animate-pulse rounded" />
                </div>
              ) : (
                <p className="text-lg leading-relaxed font-sans text-foreground/90">
                  {analysis?.summary || "Analyzing market data..."}
                </p>
              )}
            </section>
          </div>

          {/* Right Column: Indicators (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <h2 className="text-sm text-muted-foreground flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4" /> Bot Modules
            </h2>

            {isLoading ? (
              <>
                <div className="h-32 bg-card animate-pulse rounded-xl border border-border/50" />
                <div className="h-32 bg-card animate-pulse rounded-xl border border-border/50" />
                <div className="h-32 bg-card animate-pulse rounded-xl border border-border/50" />
              </>
            ) : (
              <>
                <IndicatorCard
                  title="MACD MOMENTUM"
                  value={analysis?.indicators?.macd || { value: 0, signal: "neutral" as const, histogram: 0 }}
                  icon={<BarChart2 className="w-4 h-4" />}
                >
                  <div className="mt-2 text-xs font-mono text-muted-foreground flex justify-between">
                    <span>HISTOGRAM</span>
                    <span
                      className={cn(
                        (analysis?.indicators?.macd?.histogram || 0) > 0
                          ? "text-green-400"
                          : "text-red-400",
                      )}
                    >
                      {analysis?.indicators?.macd?.histogram?.toFixed(4)}
                    </span>
                  </div>
                  <div className="w-full bg-muted/30 h-1.5 rounded-full mt-2 overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        (analysis?.indicators?.macd?.histogram || 0) > 0
                          ? "bg-green-500"
                          : "bg-red-500",
                      )}
                      style={{
                        width: `${Math.min(Math.abs((analysis?.indicators?.macd?.histogram || 0) * 50), 100)}%`,
                      }}
                    />
                  </div>
                </IndicatorCard>

                <IndicatorCard
                  title="STOCHASTIC OSC"
                  value={analysis?.indicators?.stochastic || { value: 50, k: 50, d: 50, signal: "neutral" as const }}
                  icon={<RefreshCcw className="w-4 h-4" />}
                >
                  <div className="grid grid-cols-2 gap-4 mt-2">
                    <div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        FAST %K
                      </div>
                      <div className="text-sm font-mono text-foreground">
                        {analysis?.indicators?.stochastic?.k?.toFixed(1)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground font-mono">
                        SLOW %D
                      </div>
                      <div className="text-sm font-mono text-foreground">
                        {analysis?.indicators?.stochastic?.d?.toFixed(1)}
                      </div>
                    </div>
                  </div>
                  <div className="w-full bg-muted/30 h-1.5 rounded-full mt-2 overflow-hidden relative">
                    {/* Range markers */}
                    <div className="absolute left-[20%] top-0 bottom-0 w-0.5 bg-white/10" />
                    <div className="absolute left-[80%] top-0 bottom-0 w-0.5 bg-white/10" />
                    <div
                      className="h-full bg-blue-500 transition-all duration-500"
                      style={{
                        width: `${analysis?.indicators?.stochastic?.k || 0}%`,
                      }}
                    />
                  </div>
                </IndicatorCard>

                <div className="bg-card rounded-xl p-5 border border-border/50">
                  <h3 className="font-display text-sm font-semibold tracking-wider text-muted-foreground mb-4">
                    KEY LEVELS
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-red-400/80 font-mono text-xs">
                        RESISTANCE
                      </span>
                      <span className="font-mono text-foreground">
                        ${(analysis?.levels?.resistance?.[0] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-blue-400/80 font-mono text-xs">
                        CURRENT
                      </span>
                      <span className="font-mono text-foreground font-bold">
                        ${(analysis?.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-green-400/80 font-mono text-xs">
                        SUPPORT
                      </span>
                      <span className="font-mono text-foreground">
                        ${(analysis?.levels?.support?.[0] || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* History Log */}
        <div className="bg-card rounded-xl border border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/50 bg-muted/10">
            <h2 className="text-sm font-display tracking-wider text-muted-foreground">
              ACTIVITY LOG
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/20 text-xs uppercase font-mono text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3">Signal Summary</th>
                  <th className="px-6 py-3 text-right">Trend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                <AnimatePresence>
                  {history?.slice(0, 10).map((analysis: any, idx: number) => (
                    <motion.tr
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="hover:bg-muted/10 transition-colors font-mono"
                    >
                      <td className="px-6 py-4 text-muted-foreground">
                        {analysis.timestamp
                          ? format(new Date(analysis.timestamp), "HH:mm:ss")
                          : "-"}
                      </td>
                      <td className="px-6 py-4 font-medium">
                        ${(analysis.price || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-muted-foreground truncate max-w-xs">
                        {analysis?.summary || "Analyzing..."}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={cn(
                            "px-2 py-1 rounded text-[10px] uppercase border",
                            analysis?.indicators?.trend === "bullish"
                              ? "bg-green-500/10 text-green-400 border-green-500/20"
                              : analysis?.indicators?.trend === "bearish"
                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                : "bg-gray-500/10 text-gray-400 border-gray-500/20",
                          )}
                        >
                          {analysis?.indicators?.trend || "NEUTRAL"}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
            {(!history || history.length === 0) && (
              <div className="p-8 text-center text-muted-foreground font-mono text-sm">
                No historical data recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
