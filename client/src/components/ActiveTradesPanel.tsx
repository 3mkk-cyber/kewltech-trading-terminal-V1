import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";

interface ActiveTrade {
  id: string;
  symbol: string;
  tradeType: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  entryTime: number;
  unrealizedPnlUsd: number;
  unrealizedPnLPercent?: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskAmountUsd: number;
  duration: number;
  strategy?: string;
  interval?: string;
  isAggressive?: boolean;
}

export function ActiveTradesPanel() {
  const [trades, setTrades] = useState<ActiveTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(true);

  const fetchActiveTrades = async () => {
    try {
      const response = await fetch("/api/bot/open-trades");
      if (!response.ok) return;
      const data = await response.json();
      if (data.success) {
        setTrades(data.data || []);
      }
    } catch (err) {
      console.error("Failed to fetch trades:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveTrades();
    const interval = setInterval(fetchActiveTrades, 2000);
    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `<1m`;
  };

  const totalPnL = trades.reduce((sum, trade) => sum + (trade.unrealizedPnlUsd || 0), 0);
  const winnersCount = trades.filter(t => (t.unrealizedPnlUsd || 0) > 0).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <CollapsibleTrigger className="w-full p-3 hover:bg-card/20 transition-colors border-b border-border/50 cursor-pointer">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-500" />
            <h3 className="text-xs font-semibold text-foreground">
              ACTIVE TRADES
            </h3>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {trades.length}/5
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="text-green-500">▲{winnersCount}</span>
              <span className="text-muted-foreground">/</span>
              <span className="text-red-500">▼{trades.length - winnersCount}</span>
            </div>
            <div className={`text-xs font-mono font-bold ${totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </div>
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="p-3">
          {loading && (
            <div className="text-center py-6 text-xs text-muted-foreground">Loading...</div>
          )}

          {!loading && trades.length === 0 && (
            <div className="text-center py-6 text-xs text-muted-foreground">
              No active trades
            </div>
          )}

          {!loading && trades.length > 0 && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {trades.map((trade) => {
                const pnl = trade.unrealizedPnlUsd || 0;
                const pnlPercent = ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.tradeType === 'short' ? -1 : 1);
                const isWinning = pnl > 0;

                return (
                  <div
                    key={trade.id}
                    className={`p-2.5 rounded border ${isWinning ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/5 border-red-500/30'}`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={trade.tradeType === "long" ? "default" : "destructive"}
                          className="text-[10px] px-1.5 py-0 h-5"
                        >
                          {trade.tradeType === "long" ? "↑" : "↓"} {trade.tradeType.toUpperCase()}
                        </Badge>
                        <span className="font-bold text-sm">
                          {trade.symbol.replace('SPOT_', '').replace('_USDT', '')}
                        </span>
                        {trade.isAggressive && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 bg-blue-500/10 border-blue-500/30">
                            5m
                          </Badge>
                        )}
                      </div>
                      <div className="text-right">
                        <div className={`text-sm font-bold ${isWinning ? 'text-green-500' : 'text-red-500'}`}>
                          {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                        </div>
                        <div className={`text-[10px] ${isWinning ? 'text-green-500' : 'text-red-500'}`}>
                          {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <div className="text-muted-foreground">Entry</div>
                        <div className="font-mono">${trade.entryPrice.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Current</div>
                        <div className="font-mono font-semibold">${trade.currentPrice.toFixed(2)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-muted-foreground">Duration</div>
                        <div className="font-mono">{formatDuration(trade.duration)}</div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2 text-[9px]">
                      <div>
                        <span className="text-muted-foreground">SL:</span>
                        <span className="ml-1 font-mono text-red-400">${trade.stopLossPrice.toFixed(2)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground">TP:</span>
                        <span className="ml-1 font-mono text-green-400">${trade.takeProfitPrice.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
