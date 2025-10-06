CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" varchar(256),
	"user_email" varchar(320),
	"action" varchar(64) NOT NULL,
	"entity" varchar(64) NOT NULL,
	"entity_id" varchar(64),
	"route" varchar(256),
	"changes" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "training_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"module" varchar(120),
	"workstream" varchar(160),
	"phase" varchar(160),
	"topic" varchar(320) NOT NULL,
	"delivery" varchar(80),
	"hours" integer DEFAULT 0,
	"audience" varchar(160),
	"owner" varchar(120),
	"status" varchar(24) DEFAULT 'planned',
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"location_url" varchar(512),
	"prereqs" text,
	"resources_url" varchar(512),
	"notes" text,
	"reminded_24" boolean DEFAULT false,
	"reminded_1" boolean DEFAULT false,
	"source_sheet" varchar(120),
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"worker" varchar(64) NOT NULL,
	"info" jsonb DEFAULT '{}'::jsonb,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "worker_heartbeat_worker_unique" UNIQUE("worker")
);
