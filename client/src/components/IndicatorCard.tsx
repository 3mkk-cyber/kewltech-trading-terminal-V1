import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { IndicatorValue, IndicatorSignal } from "@shared/schema";
import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

interface IndicatorCardProps {
  title: string;
  value: IndicatorValue;
  icon?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const SignalBadge = ({ signal }: { signal: IndicatorSignal }) => {
  const styles = {
    buy: "bg-green-500/10 text-green-400 border-green-500/20",
    sell: "bg-red-500/10 text-red-400 border-red-500/20",
    neutral: "bg-gray-500/10 text-gray-400 border-gray-500/20",
  };

  const icons = {
    buy: <TrendingUp className="w-3 h-3 mr-1" />,
    sell: <TrendingDown className="w-3 h-3 mr-1" />,
    neutral: <Minus className="w-3 h-3 mr-1" />,
  };

  return (
    <div className={cn(
      "flex items-center px-2 py-0.5 rounded text-xs font-mono uppercase border",
      styles[signal]
    )}>
      {icons[signal]}
      {signal}
    </div>
  );
};

export function IndicatorCard({ title, value, icon, children, className }: IndicatorCardProps) {
  const isBuy = value.signal === 'buy';
  const isSell = value.signal === 'sell';

  return (
    <div className={cn(
      "bg-card rounded-xl p-5 border transition-all duration-300 relative overflow-hidden group hover:shadow-lg",
      isBuy ? "border-green-500/20 hover:border-green-500/40" : 
      isSell ? "border-red-500/20 hover:border-red-500/40" : 
      "border-border/50 hover:border-border",
      className
    )}>
      {/* Background Glow Effect */}
      <div className={cn(
        "absolute -right-10 -top-10 w-32 h-32 rounded-full blur-[50px] opacity-10 transition-colors duration-500 pointer-events-none",
        isBuy ? "bg-green-500" : isSell ? "bg-red-500" : "bg-blue-500"
      )} />

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon || <Activity className="w-4 h-4" />}
          <h3 className="font-display text-sm font-semibold tracking-wider">{title}</h3>
        </div>
        <SignalBadge signal={value.signal} />
      </div>

      <div className="relative z-10">
        <div className="flex items-baseline gap-2 mb-2">
          <span className={cn(
            "text-2xl font-mono font-bold tracking-tight",
            isBuy ? "text-green-400" : isSell ? "text-red-400" : "text-foreground"
          )}>
            {value.value.toFixed(2)}
          </span>
        </div>
        
        {children}
      </div>
    </div>
  );
}
