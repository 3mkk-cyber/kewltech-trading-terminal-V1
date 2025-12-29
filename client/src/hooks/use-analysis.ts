import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { type KewltechAnalysis, type AnalysisLog } from "@shared/schema";

// Helper to poll for live analysis
export function useLiveAnalysis(symbol: string) {
  return useQuery({
    queryKey: [api.analysis.get.path, symbol],
    queryFn: async () => {
      const url = buildUrl(api.analysis.get.path, { symbol });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch analysis");
      // The API returns a custom object matching KewltechAnalysis
      return await res.json() as KewltechAnalysis;
    },
    refetchInterval: 5000, // Poll every 5s
  });
}

// Helper for historical logs
export function useAnalysisHistory(symbol: string) {
  return useQuery({
    queryKey: [api.analysis.history.path, symbol],
    queryFn: async () => {
      const url = buildUrl(api.analysis.history.path, { symbol });
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch history");
      return await res.json();
    },
    refetchInterval: 10000, // Poll history less frequently
  });
}
