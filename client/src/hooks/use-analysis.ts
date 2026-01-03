import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type DepthSignalsAnalysis } from "@shared/schema";

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
        const data = (await res.json()) as DepthSignalsAnalysis;
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

// Helper for batch analysis (all symbols)
export function useBatchAnalysis() {
  return useQuery({
    queryKey: ["analysis-batch"],
    queryFn: async () => {
      const url = "/api/analysis/batch";
      console.log(`Fetching batch analysis from: ${url}`);
      
      try {
        const res = await fetch(url);
        if (!res.ok) {
          const error = await res.text();
          console.error(`Batch API error: ${res.status} - ${error}`);
          throw new Error(`Failed to fetch batch analysis: ${res.status}`);
        }
        const response = (await res.json()) as { success: boolean; data: DepthSignalsAnalysis[]; timestamp: number };
        console.log("Batch analysis received:", response);
        return response.data;
      } catch (error) {
        console.error("Error fetching batch analysis:", error);
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
        const data = (await res.json()) as DepthSignalsAnalysis[];
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
