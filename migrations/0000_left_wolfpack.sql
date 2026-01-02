CREATE TABLE "analysis_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"price" text NOT NULL,
	"data" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ema_trends" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"interval" varchar(10) NOT NULL,
	"ema_13" varchar(20),
	"ema_34" varchar(20),
	"ema_244" varchar(20),
	"ema_610" varchar(20),
	"recorded_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "market_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp NOT NULL,
	"symbols" jsonb NOT NULL,
	"patterns" jsonb NOT NULL,
	"signals" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "orb_data" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"orb_high" real NOT NULL,
	"orb_low" real NOT NULL,
	"orb_end_time" timestamp NOT NULL,
	"breakout_price" real,
	"breakout_type" varchar(10),
	"breakout_time" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"pattern_type" varchar(50) NOT NULL,
	"interval" varchar(10) NOT NULL,
	"detection_time" timestamp NOT NULL,
	"slope_upper" real,
	"slope_lower" real,
	"r_squared_upper" real,
	"r_squared_lower" real,
	"pivot_count" integer,
	"status" varchar(20) DEFAULT 'forming',
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" varchar(20) NOT NULL,
	"strategy" varchar(50) NOT NULL,
	"trade_type" varchar(10) NOT NULL,
	"interval" varchar(10) NOT NULL,
	"entry_price" real NOT NULL,
	"stop_loss_price" real NOT NULL,
	"take_profit_price" real NOT NULL,
	"position_size" real,
	"risk_amount" real NOT NULL,
	"signal_time" timestamp NOT NULL,
	"confidence" integer,
	"pattern_id" integer,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"signal_id" integer,
	"symbol" varchar(20) NOT NULL,
	"entry_price" real NOT NULL,
	"entry_time" timestamp NOT NULL,
	"stop_loss_price" real NOT NULL,
	"take_profit_price" real NOT NULL,
	"position_size" real,
	"risk_amount_usd" real,
	"exit_price" real,
	"exit_time" timestamp,
	"status" varchar(20),
	"pnl" real,
	"pnl_percent" real,
	"is_aggressive" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_pattern_id_patterns_id_fk" FOREIGN KEY ("pattern_id") REFERENCES "public"."patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE no action ON UPDATE no action;