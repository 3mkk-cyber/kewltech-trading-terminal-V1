ALTER TABLE "trades" ADD COLUMN "exit_reason" varchar(20);--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "gross_pnl_usd" real;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "fees_usd" real;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "net_pnl_usd" real;--> statement-breakpoint
ALTER TABLE "trades" ADD COLUMN "is_winner" boolean;