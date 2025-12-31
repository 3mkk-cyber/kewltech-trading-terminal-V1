import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type KewltechAnalysis } from "@shared/schema";

// Helper to poll for live analysis
export function useLiveAnalysis(symbol: string) {
  return useQuery({
    queryKey: ["analysis", symbol],
    queryFn: async () => {
      const url = buildUrl(api.analysis.get.path, { symbol });
      console.log(`Fetching live analysis from: ${url}`);
      
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const error = await res.text();
          console.error(`API error: ${res.status} - ${error}`);
          throw new Error(`Failed to fetch analysis: ${res.status}`);
        }
        const data = (await res.json()) as KewltechAnalysis;
        console.log("Live analysis received:", data);
        return data;
      } catch (error) {
        console.error("Error fetching live analysis:", error);
        throw error;
      }
    },
    refetchInterval: 5000, // Poll every 5s
    retry: 2,
  });
}

// Helper for historical logs
export function useAnalysisHistory(symbol: string) {
  return useQuery({
    queryKey: ["analysis-history", symbol],
    queryFn: async () => {
      const url = buildUrl(api.analysis.history.path, { symbol });
      console.log(`Fetching history from: ${url}`);
      
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const error = await res.text();
          console.error(`History API error: ${res.status} - ${error}`);
          throw new Error(`Failed to fetch history: ${res.status}`);
        }
        const data = (await res.json()) as KewltechAnalysis[];
        console.log("History received:", data);
        return data;
      } catch (error) {
        console.error("Error fetching history:", error);
        throw error;
      }
    },
    refetchInterval: 10000, //Poll history less frequently
    retry: 2,
  });
}
