import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp } from "lucide-react";

interface OpenTrade {
  id: string;
  symbol: string;
  tradeType: "long" | "short";
  entryPrice: number;
  currentPrice: number;
  positionSize: number;
  entryTime: number;
  unrealizedPnlUsd: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  riskAmountUsd: number;
  duration: number; // seconds
  isAggressive: boolean; // 5m trade?
}

export function OpenTradesPanel() {
  const [trades, setTrades] = useState<OpenTrade[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("/api/bot/open-trades");
        const result = await response.json();
        if (result.success) {
          setTrades(result.data);
        }
      } catch (error) {
        console.error("Error fetching open trades:", error);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchTrades();

    // Poll for updates every 2 seconds for real-time updates
    const interval = setInterval(fetchTrades, 2000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatPnl = (pnl: number) => {
    return `$${pnl.toFixed(2)}`;
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const getChangePercent = (entry: number, current: number) => {
    return ((current - entry) / entry) * 100;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Open Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  const totalUnrealizedPnL = trades.reduce((sum, t) => sum + t.unrealizedPnlUsd, 0);

  return (
    <Card className="w-full bg-background/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-yellow-500" />
            <CardTitle>Open Trades</CardTitle>
          </div>
          {trades.length > 0 && (
            <div className="text-sm font-medium text-muted-foreground">
              {trades.length} position{trades.length !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Statistics */}
        {trades.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border border-border/30">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Open Positions
              </div>
              <div className="text-2xl font-bold text-foreground">
                {trades.length}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Unrealized P&L
              </div>
              <div
                className={`text-2xl font-bold ${
                  totalUnrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {totalUnrealizedPnL >= 0 ? "+" : ""}
                {formatPnl(totalUnrealizedPnL)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                5m Trades
              </div>
              <div className="text-2xl font-bold text-blue-500">
                {trades.filter((t) => t.isAggressive).length}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Standard Trades
              </div>
              <div className="text-2xl font-bold text-purple-500">
                {trades.filter((t) => !t.isAggressive).length}
              </div>
            </div>
          </div>
        )}

        {/* Trades Table */}
        {trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-card/30">
                  <th className="text-left px-3 py-2 font-semibold text-foreground">
                    Symbol
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-foreground">
                    Direction
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    Entry
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    Current
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    P&L
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    Size
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-foreground">
                    Type
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    SL / TP
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-foreground">
                    Duration
                  </th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => {
                  const changePercent = getChangePercent(
                    trade.entryPrice,
                    trade.currentPrice
                  );
                  const isPositive = trade.unrealizedPnlUsd >= 0;

                  return (
                    <tr
                      key={trade.id}
                      className={`border-b border-border/30 hover:bg-card/20 ${
                        isPositive ? "bg-green-500/5" : "bg-red-500/5"
                      }`}
                    >
                      <td className="px-3 py-2 font-semibold text-foreground">
                        {trade.symbol}
                      </td>
                      <td className="text-center px-3 py-2">
                        <Badge
                          variant="outline"
                          className={trade.tradeType === "long" 
                            ? "bg-green-500/20 text-green-300 border-green-500/30 font-semibold"
                            : "bg-red-500/20 text-red-300 border-red-500/30 font-semibold"
                          }
                        >
                          {trade.tradeType.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="text-right px-3 py-2 text-foreground">
                        ${trade.entryPrice.toFixed(2)}
                      </td>
                      <td className="text-right px-3 py-2 text-foreground">
                        ${trade.currentPrice.toFixed(2)}
                      </td>
                      <td
                        className={`text-right px-3 py-2 font-semibold ${
                          isPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {formatPnl(trade.unrealizedPnlUsd)} ({changePercent.toFixed(2)}%)
                      </td>
                      <td className="text-right px-3 py-2 text-foreground">
                        {trade.positionSize.toFixed(4)}
                      </td>
                      <td className="text-center px-3 py-2">
                        <Badge
                          variant={
                            trade.isAggressive ? "secondary" : "outline"
                          }
                          className={
                            trade.isAggressive
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                              : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                          }
                        >
                          {trade.isAggressive ? "5m" : "STD"}
                        </Badge>
                      </td>
                      <td className="text-right px-3 py-2 text-xs text-muted-foreground">
                        <div>${trade.stopLossPrice.toFixed(2)}</div>
                        <div className="text-green-600">
                          ${trade.takeProfitPrice.toFixed(2)}
                        </div>
                      </td>
                      <td className="text-left px-3 py-2 text-xs text-muted-foreground">
                        {formatDuration(trade.duration)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No open trades</p>
            <p className="text-sm text-muted-foreground/70">
              Active positions will appear here in real-time
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
