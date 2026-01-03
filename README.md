# Kewltech Trading Terminal V1

🚀 **AI-Powered Cryptocurrency Trading Bot with Advanced Pattern Recognition**

An intelligent trading bot featuring comprehensive technical pattern detection, AI learning engine, and automated trade execution on WooFi Pro exchange.

---

## 🌟 Features

### 📊 Enhanced Pattern Detection System
- **8 Pattern Types** covering both bullish and bearish market conditions:
  - **Bullish Patterns**: Double Bottom, Ascending Triangle, Inverse Head & Shoulders, Bullish Wedge
  - **Bearish Patterns**: Double Top, Descending Triangle, Head & Shoulders, Bearish Wedge
- **Multi-timeframe Analysis**: 15-minute and 1-hour candles for comprehensive market view
- **High Accuracy**: Confidence scoring system (0-100) with multi-layer filtering

### 🧠 AI Learning Engine
- **Database Persistence**: Continuous learning across restarts
- **Performance Analysis**: Tracks strategy, symbol, and pattern quality
- **Signal Filtering**: Automatically blocks poor-performing signals (quality threshold ≥45)
- **Adaptive Position Sizing**: Adjusts trade size based on historical win rates
- **Auto-Save**: Stores learning data every 5 minutes

### 📈 Technical Indicators
- **MACD** (12, 26, 9): Momentum and trend confirmation
- **Stochastic Oscillator** (14, 3, 3): Overbought/oversold conditions
- **RSI** (14): Relative strength validation
- **ADL**: Accumulation/Distribution Line for volume-price analysis
- **EMA**: Multi-period exponential moving averages (8, 13, 21, 34, 50, 100)

### 🎯 Support & Resistance Detection
- Automatic pivot level identification
- 0.5% price clustering tolerance
- Integration with pattern confidence scoring

### ⚡ Auto-Trading
- **Fully Automated Execution**: Trades execute without manual intervention
- **Risk Management**: 2.5:1 reward/risk ratio, 1% risk per trade
- **Max Concurrent Trades**: 5 simultaneous positions
- **Live Market Prices**: Real-time WooFi Pro API integration
- **Stop Loss & Take Profit**: Automatic position management

### 🗄️ Database Persistence
- **PostgreSQL 15.2** in Docker container
- **Trade History**: Complete record of all executed trades
- **Pattern Storage**: Historical pattern detection data
- **Learning Data**: Strategy, symbol, and pattern performance metrics

---

## 🛠️ Tech Stack

### Backend
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL 15.2 (Docker)
- **ORM**: Drizzle ORM

### Frontend
- **Framework**: React with TypeScript
- **Build Tool**: Vite
- **UI Components**: Shadcn UI
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **API Client**: WooFi Pro REST API

---

## 📦 Installation

### Prerequisites
- **Node.js**: v18+ recommended
- **Docker Desktop**: For PostgreSQL container
- **Git**: For version control

### 1. Clone Repository
```bash
git clone https://github.com/3mkk-cyber/kewltech-trading-terminal-V1.git
cd kewltech-trading-terminal-V1
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment
Create a `.env` file in the root directory:
```env
# WooFi Pro API Credentials
WOOFI_API_KEY=your_api_key_here
WOOFI_API_SECRET=your_api_secret_here
WOOFI_APPLICATION_ID=your_app_id_here

# Database Configuration
DATABASE_URL=postgresql://user:password@localhost:5432/kewltech_trading

# Server Configuration
PORT=5000
NODE_ENV=development
```

### 4. Start Database
```bash
docker-compose up -d
```

### 5. Run Migrations
```bash
npm run db:push
```

### 6. Start Development Server
```bash
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:5000

---

## 🎮 Usage

### Dashboard Overview
Access the main dashboard to view:
- **Live Pattern Detection**: Real-time pattern formation across 6 symbols (BTC, ETH, SOL, ADA, DOGE, POL)
- **Open Trades**: Active positions with P&L tracking
- **Trade History**: Historical performance analytics
- **Bot Signals**: AI-filtered trading signals with quality scores

### Configuration
Edit [server/config.ts](server/config.ts) to customize:
- **Monitored Symbols**: Add/remove trading pairs
- **Risk Parameters**: Adjust position sizing and risk per trade
- **Timeframes**: Modify scan intervals and candle periods
- **Auto-Trading**: Enable/disable automated execution
- **Learning Engine**: Configure quality thresholds and filter settings

### Manual Trading
While auto-trading is enabled by default, you can:
1. Review signals on the dashboard
2. Manually approve/reject signals
3. Monitor AI quality scores before execution
4. Close trades manually if needed

---

## 🧪 Testing

### Run Tests
```bash
npm test
```

### Database Testing
```bash
npm run test:db
```

### Pattern Detection Test
```bash
python test_paper_trading.py
```

---

## 📊 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React + Vite)                   │
│  Dashboard | Charts | Trades | Patterns | Bot Signals       │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                Backend (Express + TypeScript)                │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ Trading Bot     │  │ Learning Engine  │  │ Risk Mgr   │ │
│  │ - Pattern Scan  │  │ - Signal Filter  │  │ - Position │ │
│  │ - Signal Gen    │  │ - Quality Score  │  │   Sizing   │ │
│  │ - Trade Exec    │  │ - Auto-Save      │  │ - SL/TP    │ │
│  └────────┬────────┘  └─────────┬────────┘  └─────┬──────┘ │
│           │                     │                  │        │
│           ▼                     ▼                  ▼        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │        Pattern Recognizer (Enhanced)                │   │
│  │  - 8 Pattern Types  - Technical Indicators          │   │
│  │  - S/R Detection    - Confidence Scoring            │   │
│  │  - Multi-Layer Filtering                            │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               PostgreSQL Database (Docker)                   │
│  trades | signals | patterns | strategy_performance |       │
│  symbol_performance | pattern_quality                        │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  WooFi Pro Exchange API                      │
│  Market Data | Order Execution | Account Info                │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure

```
kewltech-trading-terminal-V1/
├── client/                         # React frontend
│   ├── src/
│   │   ├── components/            # UI components
│   │   │   ├── ui/               # Shadcn UI components
│   │   │   ├── PriceChart.tsx    # Trading chart
│   │   │   ├── OpenTradesPanel.tsx
│   │   │   ├── TradeHistoryPanel.tsx
│   │   │   └── BotPatternsPanel.tsx
│   │   ├── pages/                # Route pages
│   │   ├── hooks/                # Custom React hooks
│   │   └── lib/                  # Utilities
│   └── index.html
├── server/                        # Express backend
│   ├── index.ts                  # Server entry point
│   ├── config.ts                 # Configuration
│   ├── tradingBot.ts             # Main bot orchestrator
│   ├── patternRecognizer.enhanced.ts  # Pattern detection (PRODUCTION)
│   ├── learningEngine.ts         # AI learning system
│   ├── riskManager.ts            # Risk management
│   ├── woofiApiClient.ts         # Exchange API client
│   ├── db.ts                     # Database connection
│   ├── routes.ts                 # API routes
│   └── dataModels.ts             # Type definitions
├── shared/                        # Shared types
│   ├── schema.ts                 # Database schema
│   └── routes.ts                 # API routes
├── migrations/                    # Database migrations
├── docker-compose.yml            # Docker services
├── drizzle.config.ts             # Drizzle ORM config
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite config
└── README.md                     # This file
```

---

## 🔧 Configuration

### Trading Bot Settings
```typescript
// server/config.ts
export const CONFIG = {
  // Trading pairs to monitor
  SYMBOLS: ['BTC', 'ETH', 'SOL', 'ADA', 'DOGE', 'POL'],
  
  // Auto-trading configuration
  AUTO_TRADE_ON_PATTERN_DETECTION: true,
  AUTO_TRADE_ON_BREAKOUT: true,
  AGGRESSIVE_MODE: true,
  
  // Risk management
  MAX_CONCURRENT_TRADES: 5,
  ACCOUNT_EQUITY: 10000,      // USD
  RISK_PER_TRADE: 0.01,       // 1% of equity
  REWARD_RISK_RATIO: 2.5,
  
  // Timeframes
  SCAN_INTERVAL: 60000,       // 60 seconds
  CANDLE_INTERVALS: ['15m', '1h'],
  
  // Pattern detection
  CONFIDENCE_THRESHOLD: 60,   // Minimum confidence (0-100)
  
  // Learning engine
  QUALITY_SCORE_THRESHOLD: 45,  // Minimum signal quality
  UPDATE_INTERVAL: 300000,      // 5 minutes
};
```

### Database Schema
```sql
-- Trades table
CREATE TABLE trades (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL,
  trade_type VARCHAR(10) NOT NULL,  -- 'LONG' | 'SHORT'
  entry_price DECIMAL(20, 8) NOT NULL,
  exit_price DECIMAL(20, 8),
  entry_time TIMESTAMP NOT NULL,
  exit_time TIMESTAMP,
  status VARCHAR(20) NOT NULL,      -- 'open' | 'closed'
  signal_id VARCHAR(255),
  stop_loss_price DECIMAL(20, 8),
  take_profit_price DECIMAL(20, 8),
  position_size DECIMAL(20, 8),
  risk_amount_usd DECIMAL(20, 2),
  unrealized_pnl_usd DECIMAL(20, 2),
  exit_reason VARCHAR(255)
);

-- Learning engine tables
CREATE TABLE strategy_performance (
  strategy VARCHAR(100) PRIMARY KEY,
  total_trades INTEGER,
  winners INTEGER,
  losers INTEGER,
  win_rate DECIMAL(5, 2),
  avg_pnl DECIMAL(20, 2),
  total_pnl DECIMAL(20, 2),
  avg_duration INTEGER,
  confidence_score DECIMAL(5, 2),
  last_updated TIMESTAMP
);
```

---

## 📝 API Documentation

### REST Endpoints

#### Get Bot Patterns
```http
GET /api/bot/patterns
```
Returns active pattern detections with status and details.

#### Get Open Trades
```http
GET /api/bot/open-trades
```
Returns currently active trades with unrealized P&L.

#### Get Bot Signals
```http
GET /api/bot/signals
```
Returns AI-filtered trading signals with quality scores.

#### Get Trade History
```http
GET /api/bot/trades
```
Returns closed trades with performance metrics.

#### Batch Market Analysis
```http
GET /api/analysis/batch
```
Returns technical analysis for all monitored symbols.

---

## 🚨 Important Notes

### Production Deployment
- **Never commit** `.env` file with real API credentials
- Use **environment variables** in production
- Enable **SSL/TLS** for database connections
- Set `NODE_ENV=production` in production environment
- Configure **reverse proxy** (nginx) for the backend

### Security Best Practices
- Store API keys in secure environment variables
- Use read-only API keys when possible
- Enable **2FA** on exchange accounts
- Monitor bot activity regularly
- Set maximum loss limits

### Database Backups
```bash
# Backup database
docker exec kewltech-postgres pg_dump -U user kewltech_trading > backup.sql

# Restore database
docker exec -i kewltech-postgres psql -U user kewltech_trading < backup.sql
```

---

## 🐛 Troubleshooting

### Server Won't Start
- Check if PostgreSQL container is running: `docker ps`
- Verify database connection in `.env`
- Ensure port 5000 is not in use: `netstat -ano | findstr :5000`

### Patterns Not Detecting
- Verify WooFi API credentials are correct
- Check API rate limits (WooFi Pro: 10 req/sec)
- Review logs for API errors
- Ensure symbols are valid and tradeable

### AI Learning Not Working
- Check database persistence: query `strategy_performance` table
- Verify learning engine initialization in logs: `[LEARNING]`
- Ensure trades are closing properly
- Check auto-save interval (default: 5 minutes)

### Trades Not Executing
- Verify `AUTO_TRADE_ON_PATTERN_DETECTION` is `true`
- Check quality score threshold (default: ≥45)
- Review signal filtering logs: `[AI]`
- Ensure account has sufficient balance

---

## 📊 Performance Metrics

### Current System Status
- **Pattern Types**: 8 (4 bullish + 4 bearish)
- **Technical Indicators**: 5 (MACD, Stochastic, RSI, ADL, EMA)
- **Historical Trades**: 347 trades analyzed
- **Database Tables**: 6 (trades, signals, patterns, strategy_performance, symbol_performance, pattern_quality)
- **Monitored Symbols**: 6 (BTC, ETH, SOL, ADA, DOGE, POL)
- **Scan Frequency**: Every 60 seconds
- **Learning Persistence**: Auto-save every 5 minutes

### Enhancement History
- ✅ Fixed bearish-only signal generation (root cause: wedge-only system)
- ✅ Built comprehensive 8-pattern detection system
- ✅ Integrated 5 technical indicators with multi-timeframe analysis
- ✅ Implemented support/resistance detection with clustering
- ✅ Created confidence scoring (0-100) with 6 weighted factors
- ✅ Built multi-layer filtering (5 validation stages)
- ✅ Added AI learning engine with database persistence
- ✅ Enabled auto-trading with adaptive position sizing
- ✅ Resolved TypeScript compilation errors
- ✅ Cleaned database and restarted with fresh slate

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## 📄 License

This project is private and proprietary. Unauthorized copying, distribution, or modification is prohibited.

---

## 👤 Author

**Kewltech Team**
- GitHub: [@3mkk-cyber](https://github.com/3mkk-cyber)
- Repository: [kewltech-trading-terminal-V1](https://github.com/3mkk-cyber/kewltech-trading-terminal-V1)

---

## 🙏 Acknowledgments

- **WooFi Pro** for exchange API
- **Shadcn UI** for beautiful component library
- **TanStack Query** for efficient data fetching
- **Drizzle ORM** for type-safe database queries
- **Docker** for containerization

---

## 📞 Support

For issues or questions:
1. Check the **Troubleshooting** section above
2. Review closed issues on GitHub
3. Open a new issue with detailed description

---

**⚠️ Disclaimer**: This bot is for educational and research purposes. Trading cryptocurrencies involves substantial risk of loss. Always test thoroughly with paper trading before using real funds. The developers are not responsible for any financial losses incurred.

---

**Last Updated**: January 3, 2026  
**Version**: 1.0.0  
**Status**: ✅ Production-Ready
