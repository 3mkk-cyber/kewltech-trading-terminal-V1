import { useBatchAnalysis } from "@/hooks/use-analysis";
import { DepthSignalsAnalysis } from "@shared/schema";
import { ArrowUpRight, ArrowDownRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

export function SymbolGrid() {
  const { data: analyses, isLoading, error } = useBatchAnalysis();

  if (error) {
    return (
      <div className="text-red-500 text-sm font-mono p-4">
        Failed to load symbol data
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {isLoading ? (
        Array(6)
          .fill(0)
          .map((_, i) => (
            <Card key={i} className="p-4 bg-muted/50 animate-pulse h-40" />
          ))
      ) : analyses && analyses.length > 0 ? (
        analyses.map((analysis: DepthSignalsAnalysis) => (
          <SymbolCard key={analysis.symbol} analysis={analysis} />
        ))
      ) : (
        <div className="col-span-full text-muted-foreground text-center py-8">
          No data available
        </div>
      )}
    </div>
  );
}

function SymbolCard({ analysis }: { analysis: DepthSignalsAnalysis }) {
  const isBullish = analysis.indicators.trend === "bullish";
  const isBearish = analysis.indicators.trend === "bearish";

  const displaySymbol = analysis.symbol.replace("USDT", "");

  return (
    <Card
      className={cn(
        "p-4 border transition-all hover:shadow-lg",
        isBullish
          ? "bg-green-500/5 border-green-500/30 hover:border-green-500/50"
          : isBearish
            ? "bg-red-500/5 border-red-500/30 hover:border-red-500/50"
            : "bg-muted/50 border-border/50"
      )}
    >
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-mono font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            {displaySymbol}
          </h3>
          <div
            className={cn(
              "px-2 py-1 rounded text-xs font-mono font-semibold uppercase",
              isBullish
                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                : isBearish
                  ? "bg-red-500/20 text-red-400 border border-red-500/30"
                  : "bg-muted text-muted-foreground border border-border/50"
            )}
          >
            {analysis.indicators.trend}
          </div>
        </div>

        {/* Price */}
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold flex items-center gap-1">
            {isBullish && <ArrowUpRight className="w-5 h-5 text-green-500" />}
            {isBearish && <ArrowDownRight className="w-5 h-5 text-red-500" />}$
            {analysis.price.toFixed(2)}
          </span>
        </div>

        {/* Indicators Grid */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-background/50 rounded p-2">
            <div className="text-muted-foreground font-mono mb-1">MACD</div>
            <div
              className={cn(
                "font-mono font-semibold",
                analysis.indicators.macd.signal === "buy"
                  ? "text-green-400"
                  : analysis.indicators.macd.signal === "sell"
                    ? "text-red-400"
                    : "text-muted-foreground"
              )}
            >
              {analysis.indicators.macd.value.toFixed(1)}
            </div>
          </div>
          <div className="bg-background/50 rounded p-2">
            <div className="text-muted-foreground font-mono mb-1">RSI</div>
            <div className="font-mono font-semibold text-cyan-400">
              {analysis.indicators.rsi.value.toFixed(1)}
            </div>
          </div>
          <div className="bg-background/50 rounded p-2">
            <div className="text-muted-foreground font-mono mb-1">Stoch</div>
            <div className="font-mono font-semibold text-yellow-400">
              {analysis.indicators.stochastic?.k?.toFixed(1) || "N/A"}
            </div>
          </div>
        </div>

        {/* Support/Resistance */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-background/50 rounded p-2">
            <div className="text-muted-foreground font-mono text-[10px] mb-1">
              SUPPORT
            </div>
            <div className="font-mono font-semibold">
              ${analysis.levels.support[0]?.toFixed(2) || "N/A"}
            </div>
          </div>
          <div className="bg-background/50 rounded p-2">
            <div className="text-muted-foreground font-mono text-[10px] mb-1">
              RESISTANCE
            </div>
            <div className="font-mono font-semibold">
              ${analysis.levels.resistance[0]?.toFixed(2) || "N/A"}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
