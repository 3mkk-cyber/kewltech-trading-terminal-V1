import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, History, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClosedTrade {
  id: string;
  symbol: string;
  tradeType: "long" | "short";
  entryPrice: number;
  exitPrice: number | null;
  positionSize: number;
  entryTime: number;
  exitTime: number | null;
  exitReason: string | null;
  pnlUsd: number;
  riskAmountUsd: number;
  duration: number;
  strategy: string;
  interval: string;
  isWinner: boolean;
}

export function TradeHistoryPanel() {
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("/api/bot/trade-history?limit=50");
        const result = await response.json();
        if (result.success) {
          setTrades(result.data);
        }
      } catch (error) {
        console.error("Error fetching trade history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchTrades();
    // Refresh every 30 seconds
    const interval = setInterval(fetchTrades, 30000);
    return () => clearInterval(interval);
  }, []);

  const winners = trades.filter(t => t.isWinner);
  const losers = trades.filter(t => !t.isWinner);
  const totalPnL = trades.reduce((sum, t) => sum + t.pnlUsd, 0);
  const winRate = trades.length > 0 ? (winners.length / trades.length) * 100 : 0;

  const formatDuration = (ms: number) => {
    if (!ms || ms === 0) return 'N/A';
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return '<1m';
  };

  const formatTime = (timestamp: number | null) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Determine win rate color
  const getWinRateColor = () => {
    if (winRate >= 60) return "text-green-600";
    if (winRate >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-3">
        {/* Clickable header */}
        <div 
          className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">Trade History</CardTitle>
            {trades.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {trades.length}
              </Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Summary stats - always visible */}
        {trades.length > 0 && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-card/70 p-2.5 rounded-lg border border-border/30">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">
                Win Rate
              </div>
              <div className={cn("text-lg font-bold", getWinRateColor())}>
                {winRate.toFixed(1)}%
              </div>
              <div className="text-[9px] text-muted-foreground/70 mt-1">
                {winners.length}W / {losers.length}L
              </div>
            </div>
            <div className="bg-card/70 p-2.5 rounded-lg border border-border/30">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">
                Total P&L
              </div>
              <div className={cn(
                "text-lg font-bold",
                totalPnL >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
              </div>
            </div>
            <div className="bg-card/70 p-2.5 rounded-lg border border-border/30">
              <div className="text-[9px] text-muted-foreground uppercase tracking-wide mb-1">
                Trades
              </div>
              <div className="text-lg font-bold text-foreground">
                {trades.length}
              </div>
            </div>
          </div>
        )}
      </CardHeader>

      {/* Expanded content - conditional */}
      {isExpanded && (
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading trade history...
            </div>
          ) : trades.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No closed trades yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Trades will appear here as the bot closes positions
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2">
              {trades.map((trade) => (
                <div
                  key={trade.id}
                  className={cn(
                    "p-4 rounded-lg border transition-colors",
                    trade.isWinner
                      ? "bg-green-500/10 border-green-500/30 hover:bg-green-500/15"
                      : "bg-red-500/10 border-red-500/30 hover:bg-red-500/15"
                  )}
                >
                  {/* Header row: Symbol, type, interval */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm">{trade.symbol}</span>
                      <Badge 
                        variant={trade.tradeType === "long" ? "default" : "destructive"}
                        className="text-[9px] h-4 px-1.5"
                      >
                        {trade.tradeType === "long" ? "LONG" : "SHORT"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5">
                        {trade.interval}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDuration(trade.duration)}
                    </div>
                  </div>

                  {/* Price info */}
                  <div className="grid grid-cols-2 gap-3 mb-2 text-[11px]">
                    <div>
                      <div className="text-[9px] text-muted-foreground mb-1">Entry</div>
                      <div className="font-semibold">${trade.entryPrice?.toFixed(2) ?? 'N/A'}</div>
                    </div>
                    <div>
                      <div className="text-[9px] text-muted-foreground mb-1">Exit</div>
                      <div className="font-semibold">${trade.exitPrice?.toFixed(2) ?? 'N/A'}</div>
                    </div>
                  </div>

                  {/* P&L and exit info */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/30">
                    <div className="flex items-center gap-2">
                      {trade.isWinner ? (
                        <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-red-600" />
                      )}
                      <span className={cn(
                        "text-base font-bold",
                        trade.isWinner ? "text-green-600" : "text-red-600"
                      )}>
                        {trade.isWinner ? "+" : ""}${trade.pnlUsd?.toFixed(2) ?? '0.00'}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-muted-foreground">
                        {trade.exitReason ? trade.exitReason.replace(/_/g, ' ') : 'Manual exit'}
                      </div>
                      <div className="text-[9px] text-muted-foreground/70">
                        {trade.exitTime ? formatTime(trade.exitTime) : 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
