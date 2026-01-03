import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { DepthSignalsAnalysis } from "@shared/schema";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";

interface PriceChartProps {
  data: DepthSignalsAnalysis[] | undefined;
  isLoading: boolean;
}

export function PriceChart({ data, isLoading }: PriceChartProps) {
  if (isLoading) {
    return (
      <div className="h-[400px] w-full flex items-center justify-center bg-card/50 rounded-xl border border-dashed border-border/50">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm font-mono">LOADING MARKET DATA...</p>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-[400px] w-full flex items-center justify-center bg-card/50 rounded-xl border border-dashed border-border/50">
        <p className="text-muted-foreground font-mono">NO MARKET DATA AVAILABLE</p>
      </div>
    );
  }

  // Transform data for chart
  const chartData = data.slice().reverse().map(analysis => ({
    time: analysis.timestamp || Date.now(),
    price: analysis.price,
    // extract macd if available just for potential overlay (not used yet)
    // macd: analysis.indicators?.macd?.value
  }));

  const lastPrice = chartData[chartData.length - 1].price;
  const firstPrice = chartData[0].price;
  const isUp = lastPrice >= firstPrice;

  return (
    <div className="h-[400px] w-full bg-card rounded-xl border border-border/50 p-4 shadow-inner">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0.2}/>
              <stop offset="95%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
          <XAxis 
            dataKey="time" 
            tickFormatter={(ts) => format(ts, "HH:mm")}
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={30}
          />
          <YAxis 
            domain={['auto', 'auto']}
            stroke="#64748b"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            width={60}
            tickFormatter={(val) => val.toLocaleString(undefined, { minimumFractionDigits: 0 })}
          />
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#0f172a', 
              borderColor: '#1e293b',
              color: '#f8fafc',
              fontFamily: 'JetBrains Mono',
              fontSize: '12px'
            }}
            itemStyle={{ color: '#f8fafc' }}
            labelFormatter={(label) => format(label, "PP HH:mm:ss")}
            formatter={(value: number) => [`$${value.toLocaleString()}`, "Price"]}
          />
          <Area 
            type="monotone" 
            dataKey="price" 
            stroke={isUp ? "#22c55e" : "#ef4444"} 
            strokeWidth={2}
            fillOpacity={1} 
            fill="url(#colorPrice)" 
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
