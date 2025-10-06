CREATE TABLE "integration_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"integration_id" uuid NOT NULL,
	"environment" varchar(32) DEFAULT 'test',
	"status" varchar(24) DEFAULT 'not_started',
	"executed_at" timestamp with time zone DEFAULT now(),
	"notes" text,
	"link" varchar(512),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "owner" varchar(120);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "environment" varchar(32);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "test_status" varchar(32);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "cutover_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "cutover_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "runbook_url" varchar(512);--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "notes" text;