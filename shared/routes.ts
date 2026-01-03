
import { z } from 'zod';
import { insertAnalysisLogSchema, analysisLogs } from './schema';

export const errorSchemas = {
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  analysis: {
    get: {
      method: 'GET' as const,
      path: '/api/analysis/:symbol',
      responses: {
        200: z.custom<any>(), // Using custom any for the complex DepthSignalsAnalysis type defined in schema
        500: errorSchemas.internal,
      },
    },
    history: {
      method: 'GET' as const,
      path: '/api/analysis/:symbol/history',
      responses: {
        200: z.array(z.custom<typeof analysisLogs.$inferSelect>()),
      },
    }
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
