import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ClosedTrade {
  id: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  positionSize: number;
  entryTime: number;
  exitTime: number;
  exitReason: "TAKE_PROFIT" | "STOP_LOSS" | "MANUAL";
  grossPnlUsd: number;
  feesUsd: number;
  netPnlUsd: number;
  riskAmount: number;
  isWinner: boolean;
}

interface TradeStats {
  totalTrades: number;
  winners: number;
  losers: number;
  winRate: number;
  totalNetPnl: number;
  averagePnl: number;
}

export function TradeHistoryPanel() {
  const [trades, setTrades] = useState<ClosedTrade[]>([]);
  const [stats, setStats] = useState<TradeStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const response = await fetch("/api/bot/trades");
        const result = await response.json();
        if (result.success) {
          setTrades(result.data);
          setStats(result.stats);
        }
      } catch (error) {
        console.error("Error fetching closed trades:", error);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchTrades();

    // Poll for new trades every 5 seconds
    const interval = setInterval(fetchTrades, 5000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatPnl = (pnl: number) => {
    return `$${pnl.toFixed(2)}`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Paper Trading Results</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full bg-background/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle>Paper Trading Results</CardTitle>
          {stats && stats.totalTrades > 0 && (
            <div className="text-sm font-medium text-muted-foreground">
              {stats.totalTrades} trades
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Statistics */}
        {stats && stats.totalTrades > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-card/50 rounded-lg border border-border/30">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Total Trades
              </div>
              <div className="text-2xl font-bold text-foreground">
                {stats.totalTrades}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Win Rate
              </div>
              <div className="text-2xl font-bold text-green-600">
                {stats.winRate.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground/70">
                {stats.winners}W / {stats.losers}L
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Total P&L
              </div>
              <div
                className={`text-2xl font-bold ${
                  stats.totalNetPnl >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatPnl(stats.totalNetPnl)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide">
                Avg P&L
              </div>
              <div
                className={`text-2xl font-bold ${
                  stats.averagePnl >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatPnl(stats.averagePnl)}
              </div>
            </div>
          </div>
        )}

        {/* Trade Table */}
        {trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-card/30">
                  <th className="text-left px-3 py-2 font-semibold text-foreground">
                    Symbol
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    Entry
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    Exit
                  </th>
                  <th className="text-right px-3 py-2 font-semibold text-foreground">
                    P&L
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-foreground">
                    Status
                  </th>
                  <th className="text-center px-3 py-2 font-semibold text-foreground">
                    Reason
                  </th>
                  <th className="text-left px-3 py-2 font-semibold text-foreground">
                    Exit Time
                  </th>
                </tr>
              </thead>
              <tbody>
                {trades
                  .slice()
                  .reverse()
                  .map((trade) => (
                    <tr
                      key={trade.id}
                      className={`border-b border-border/30 hover:bg-card/20 ${
                        trade.isWinner ? "bg-green-500/5" : "bg-red-500/5"
                      }`}
                    >
                      <td className="px-3 py-2 font-semibold text-foreground">
                        {trade.symbol}
                      </td>
                      <td className="text-right px-3 py-2 text-foreground">
                        ${trade.entryPrice.toFixed(2)}
                      </td>
                      <td className="text-right px-3 py-2 text-foreground">
                        ${trade.exitPrice.toFixed(2)}
                      </td>
                      <td
                        className={`text-right px-3 py-2 font-semibold ${
                          trade.isWinner ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {trade.isWinner ? "+" : ""}
                        {formatPnl(trade.netPnlUsd)}
                      </td>
                      <td className="text-center px-3 py-2">
                        <Badge
                          variant={
                            trade.isWinner
                              ? "default"
                              : "destructive"
                          }
                        >
                          {trade.isWinner ? "✓ Win" : "✗ Loss"}
                        </Badge>
                      </td>
                      <td className="text-center px-3 py-2 text-xs text-muted-foreground">
                        {trade.exitReason === "TAKE_PROFIT"
                          ? "TP"
                          : trade.exitReason === "STOP_LOSS"
                          ? "SL"
                          : "Manual"}
                      </td>
                      <td className="text-left px-3 py-2 text-xs text-muted-foreground/70">
                        {formatTime(trade.exitTime)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No closed trades yet</p>
            <p className="text-sm text-muted-foreground/70">
              Trades will appear here as the bot closes positions
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
