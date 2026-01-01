import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Zap,
  Target,
  Shield,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface BotSignal {
  id: string;
  symbol: string;
  strategy: string;
  tradeType: "long" | "short";
  entryPrice?: number;
  stopLossPrice?: number;
  takeProfitPrice?: number;
  positionSize?: number;
  riskAmount?: number;
  signalTime: number;
  confidence?: number;
  details?: any;
}

export function BotSignalsPanel() {
  const { data: signals, isLoading } = useQuery({
    queryKey: ["bot-signals"],
    queryFn: async () => {
      const res = await fetch("/api/bot/signals");
      if (!res.ok) throw new Error("Failed to fetch bot signals");
      const data = await res.json();
      return (data.data || []) as BotSignal[];
    },
    refetchInterval: 5000, // Poll every 5 seconds
    retry: 1,
  });

  const recentSignals = useMemo(
    () => (signals || []).slice(0, 5),
    [signals]
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-24 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (!signals || signals.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground">
        <Cpu className="w-4 h-4 mr-2" />
        <span className="text-sm font-mono">No active signals</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recentSignals.map((signal) => (
        <SignalCard key={signal.id} signal={signal} />
      ))}
    </div>
  );
}

function SignalCard({ signal }: { signal: BotSignal }) {
  const isLong = signal.tradeType === "long";
  const riskReward =
    isLong && signal.entryPrice && signal.stopLossPrice && signal.takeProfitPrice
      ? ((signal.takeProfitPrice - signal.entryPrice) /
          (signal.entryPrice - signal.stopLossPrice)) ||
        0
      : signal.entryPrice && signal.stopLossPrice && signal.takeProfitPrice
      ? ((signal.entryPrice - signal.takeProfitPrice) /
          (signal.stopLossPrice - signal.entryPrice)) ||
        0
      : 0;

  const signalDate = new Date(signal.signalTime);
  const timeAgo = Math.floor(
    (Date.now() - signalDate.getTime()) / 1000
  );
  const timeStr =
    isNaN(signalDate.getTime()) ? 'Unknown' :
    timeAgo < 60 ? `${timeAgo}s ago` : `${Math.floor(timeAgo / 60)}m ago`;

  return (
    <Card className="bg-card/50 border-border/50 p-4 hover:bg-card/70 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Signal Type & Symbol */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <div
              className={cn(
                "p-1.5 rounded",
                isLong
                  ? "bg-green-500/10"
                  : "bg-red-500/10"
              )}
            >
              {isLong ? (
                <TrendingUp className="w-4 h-4 text-green-500" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-500" />
              )}
            </div>
            <div>
              <h3 className="font-mono font-semibold text-sm">
                {signal.symbol}
              </h3>
              <p className="text-xs text-muted-foreground">
                {signal.strategy}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{timeStr}</p>
        </div>

        {/* Right: Prices */}
        <div className="text-right space-y-1">
          <div>
            <p className="text-xs text-muted-foreground">Entry</p>
            <p className="font-mono font-semibold text-sm">
              ${signal.entryPrice?.toFixed(2) || 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">R:R</p>
            <p className={cn(
              "font-mono font-semibold text-sm",
              riskReward > 1 ? "text-green-500" : "text-yellow-500"
            )}>
              {riskReward.toFixed(2)}:1
            </p>
          </div>
        </div>
      </div>

      {/* Bottom: Details */}
      <div className="mt-3 pt-3 border-t border-border/30 grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="text-muted-foreground flex items-center gap-1">
            <Shield className="w-3 h-3" /> SL
          </p>
          <p className="font-mono font-semibold text-red-500">
            ${signal.stopLossPrice?.toFixed(2) || 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground flex items-center gap-1">
            <Target className="w-3 h-3" /> TP
          </p>
          <p className="font-mono font-semibold text-green-500">
            ${signal.takeProfitPrice?.toFixed(2) || 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> Risk
          </p>
          <p className="font-mono font-semibold text-yellow-500">
            ${signal.riskAmount?.toFixed(2) || 'N/A'}
          </p>
        </div>
      </div>

      {signal.confidence && signal.confidence > 0 && (
        <div className="mt-2 pt-2 border-t border-border/30">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground flex items-center gap-1">
              <Zap className="w-3 h-3" /> Confidence
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-500 to-green-500 transition-all"
                  style={{ width: `${signal.confidence}%` }}
                />
              </div>
              <span className="font-mono font-semibold">
                {signal.confidence}%
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
