## Packages
recharts | For rendering the crypto price charts and indicator visualizations
date-fns | For timestamp formatting in logs and charts
framer-motion | For smooth entry animations and status transitions
clsx | For conditional class merging
tailwind-merge | For handling Tailwind class conflicts

## Notes
Tailwind Config - extend fontFamily:
fontFamily: {
  mono: ["'JetBrains Mono'", "monospace"],
  display: ["'Oxanium'", "sans-serif"],
  sans: ["'Inter'", "sans-serif"],
}

API Integration:
- Poll /api/analysis/:symbol every 5s-10s for real-time updates
- Use /api/analysis/:symbol/history for the activity log
