import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Activity, Target, DollarSign, Clock, BarChart3 } from "lucide-react";

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

interface TradingStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgWin: number;
  avgLoss: number;
  todayTrades: number;
  todayPnL: number;
}

export function OpenTradesPanel() {
  const [trades, setTrades] = useState<OpenTrade[]>([]);
  const [stats, setStats] = useState<TradingStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch open trades
        const tradesResponse = await fetch("/api/bot/open-trades");
        const tradesResult = await tradesResponse.json();
        if (tradesResult.success) {
          setTrades(tradesResult.data);
        }

        // Fetch trading statistics
        const statsResponse = await fetch("/api/bot/statistics");
        const statsResult = await statsResponse.json();
        if (statsResult.success) {
          setStats(statsResult.data);
        }
      } catch (error) {
        console.error("Error fetching trading data:", error);
      } finally {
        setLoading(false);
      }
    };

    // Initial fetch
    fetchData();

    // Poll for updates every 2 seconds for real-time updates
    const interval = setInterval(fetchData, 2000);

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
    <div className="w-full">
      <div className="p-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-yellow-500" />
            <h3 className="text-xs font-semibold">PERFORMANCE</h3>
          </div>
          {stats && (
            <div className="text-[10px] font-medium text-muted-foreground">
              {stats.todayTrades} trades today
            </div>
          )}
        </div>
      </div>
      <div className="p-3 space-y-3 max-h-[600px] overflow-y-auto">
        {/* Performance Metrics Dashboard */}
        {stats && (
          <div className="space-y-3">
            {/* Overall Performance Metrics */}
            <div className="grid grid-cols-2 gap-2 p-3 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded border border-border/30">
              <div className="flex items-center gap-2">
                <Target className="w-7 h-7 text-green-500" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Win Rate
                  </div>
                  <div className="text-xl font-bold text-foreground">
                    {stats.winRate.toFixed(1)}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {stats.winningTrades}W / {stats.losingTrades}L
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-7 h-7 text-yellow-500" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Total P&L
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      stats.totalPnL >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {stats.totalPnL >= 0 ? "+" : ""}
                    {formatPnl(stats.totalPnL)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {stats.totalTrades} trades
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-7 h-7 text-blue-500" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Avg Win/Loss
                  </div>
                  <div className="text-base font-bold text-green-600">
                    +{formatPnl(stats.avgWin)}
                  </div>
                  <div className="text-base font-bold text-red-600">
                    {formatPnl(stats.avgLoss)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-7 h-7 text-purple-500" />
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Today
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      stats.todayPnL >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {stats.todayPnL >= 0 ? "+" : ""}
                    {formatPnl(stats.todayPnL)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {stats.todayTrades} trades
                  </div>
                </div>
              </div>
            </div>

            {/* Current Open Positions Summary */}
            {trades.length > 0 && (
              <div className="grid grid-cols-4 gap-2 p-2 bg-card/50 rounded border border-border/30">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Open
                  </div>
                  <div className="text-xl font-bold text-foreground">
                    {trades.length}/5
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Unreal. P&L
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      totalUnrealizedPnL >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {totalUnrealizedPnL >= 0 ? "+" : ""}
                    {formatPnl(totalUnrealizedPnL)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    5m Agg
                  </div>
                  <div className="text-xl font-bold text-blue-500">
                    {trades.filter((t) => t.isAggressive).length}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Standard
                  </div>
                  <div className="text-xl font-bold text-purple-500">
                    {trades.filter((t) => !t.isAggressive).length}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Trades Table */}
        {trades.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 bg-card/30">
                  <th className="text-left px-2 py-1.5 font-semibold text-foreground text-[10px]">
                    Symbol
                  </th>
                  <th className="text-center px-2 py-1.5 font-semibold text-foreground text-[9px]">
                    Dir
                  </th>
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground text-[9px]">
                    Entry
                  </th>
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground text-[9px]">
                    Current
                  </th>
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground text-[9px]">
                    P&L
                  </th>
                  <th className="text-center px-2 py-1.5 font-semibold text-foreground text-[9px]">
                    Type
                  </th>
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground text-[9px]">
                    SL/TP
                  </th>
                  <th className="text-right px-2 py-1.5 font-semibold text-foreground text-[9px]">
                    Time
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
                      <td className="px-2 py-1.5 font-semibold text-foreground">
                        {trade.symbol.replace('SPOT_', '').replace('_USDT', '')}
                      </td>
                      <td className="text-center px-2 py-1.5">
                        <Badge
                          variant="outline"
                          className={`text-[8px] px-1 py-0 h-4 ${trade.tradeType === "long" 
                            ? "bg-green-500/20 text-green-300 border-green-500/30 font-semibold"
                            : "bg-red-500/20 text-red-300 border-red-500/30 font-semibold"
                          }`}
                        >
                          {trade.tradeType === "long" ? "↑" : "↓"}
                        </Badge>
                      </td>
                      <td className="text-right px-2 py-1.5 text-foreground font-mono">
                        ${trade.entryPrice.toFixed(2)}
                      </td>
                      <td className="text-right px-2 py-1.5 text-foreground font-mono font-semibold">
                        ${trade.currentPrice.toFixed(2)}
                      </td>
                      <td
                        className={`text-right px-2 py-1.5 font-semibold font-mono ${
                          isPositive ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {isPositive ? "+" : ""}
                        {formatPnl(trade.unrealizedPnlUsd)}
                        <div className="text-[8px]">({changePercent.toFixed(2)}%)</div>
                      </td>
                      <td className="text-center px-2 py-1.5">
                        <Badge
                          variant={
                            trade.isAggressive ? "secondary" : "outline"
                          }
                          className={`text-[8px] px-1 py-0 h-4 ${
                            trade.isAggressive
                              ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                              : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                          }`}
                        >
                          {trade.isAggressive ? "5m" : "STD"}
                        </Badge>
                      </td>
                      <td className="text-right px-2 py-1.5 text-[10px] text-muted-foreground font-mono">
                        <div className="text-red-400">${trade.stopLossPrice.toFixed(2)}</div>
                        <div className="text-green-400">
                          ${trade.takeProfitPrice.toFixed(2)}
                        </div>
                      </td>
                      <td className="text-right px-2 py-1.5 text-[10px] text-muted-foreground">
                        {formatDuration(trade.duration)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-xs text-muted-foreground">No open trades</p>
            <p className="text-[10px] text-muted-foreground/70">
              Positions will appear here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
