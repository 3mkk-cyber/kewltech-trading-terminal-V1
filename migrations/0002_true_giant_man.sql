CREATE TABLE "pattern_quality" (
	"id" serial PRIMARY KEY NOT NULL,
	"pattern_type" varchar(50) NOT NULL,
	"interval" varchar(10) NOT NULL,
	"success_rate" real DEFAULT 0 NOT NULL,
	"avg_pnl" real DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"reliability" real DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "strategy_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"strategy" varchar(50) NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"winners" integer DEFAULT 0 NOT NULL,
	"losers" integer DEFAULT 0 NOT NULL,
	"win_rate" real DEFAULT 0 NOT NULL,
	"avg_pnl" real DEFAULT 0 NOT NULL,
	"total_pnl" real DEFAULT 0 NOT NULL,
	"avg_duration" real DEFAULT 0 NOT NULL,
	"confidence_score" real DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "strategy_performance_strategy_unique" UNIQUE("strategy")
);
--> statement-breakpoint
CREATE TABLE "symbol_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"total_trades" integer DEFAULT 0 NOT NULL,
	"win_rate" real DEFAULT 0 NOT NULL,
	"avg_pnl" real DEFAULT 0 NOT NULL,
	"best_strategy" varchar(50),
	"volatility_score" real DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "symbol_performance_symbol_unique" UNIQUE("symbol")
);
--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "trade_type" varchar(10);