import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Zap, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

interface BotPattern {
  id: string;
  symbol: string;
  interval: string;
  patternType: string;
  detectionTime: number;
  status: "forming" | "confirmed" | "breakout";
  details?: any;
}

export function BotPatternsPanel() {
  const { data: patterns, isLoading } = useQuery({
    queryKey: ["bot-patterns"],
    queryFn: async () => {
      const res = await fetch("/api/bot/patterns");
      if (!res.ok) throw new Error("Failed to fetch bot patterns");
      const data = await res.json();
      return (data.data || []) as BotPattern[];
    },
    refetchInterval: 5000,
    retry: 1,
  });

  const recentPatterns = useMemo(
    () => (patterns || []).slice(0, 3),
    [patterns]
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (!patterns || patterns.length === 0) {
    return (
      <div className="flex items-center justify-center p-4 text-muted-foreground text-xs">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Scanning for patterns...
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {recentPatterns.map((pattern) => (
        <PatternCard key={pattern.id} pattern={pattern} />
      ))}
    </div>
  );
}

function PatternCard({ pattern }: { pattern: BotPattern }) {
  const isBullish = pattern.patternType.includes("Bullish");
  const detectionDate = new Date(pattern.detectionTime);
  const timeAgo = Math.floor(
    (Date.now() - detectionDate.getTime()) / 1000
  );
  const timeStr =
    timeAgo < 60 ? `${timeAgo}s` : `${Math.floor(timeAgo / 60)}m`;

  const statusColor = {
    forming: "bg-yellow-500/10 border-yellow-500/30",
    confirmed: "bg-blue-500/10 border-blue-500/30",
    breakout: "bg-green-500/10 border-green-500/30",
  };

  const statusLabel = {
    forming: "Forming",
    confirmed: "Confirmed",
    breakout: "Breakout!",
  };

  return (
    <Card className={cn(
      "border p-3 transition-colors hover:bg-card/70",
      statusColor[pattern.status]
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div>
              {isBullish ? (
                <TrendingUp className="w-3 h-3 text-green-500" />
              ) : (
                <TrendingDown className="w-3 h-3 text-red-500" />
              )}
            </div>
            <p className="font-mono font-semibold text-xs">
              {pattern.symbol} {pattern.interval}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {pattern.patternType}
          </p>
        </div>
        <div className="text-right">
          <span className={cn(
            "inline-block px-2 py-0.5 rounded text-xs font-mono font-semibold",
            pattern.status === "breakout"
              ? "bg-green-500/20 text-green-500"
              : pattern.status === "confirmed"
              ? "bg-blue-500/20 text-blue-500"
              : "bg-yellow-500/20 text-yellow-500"
          )}>
            {statusLabel[pattern.status]}
          </span>
          <p className="text-xs text-muted-foreground mt-1">{timeStr} ago</p>
        </div>
      </div>
    </Card>
  );
}
