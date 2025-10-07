CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"prefix" varchar(16) NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"scopes" jsonb DEFAULT '["ingest:write"]'::jsonb,
	"created_by_email" varchar(320),
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "asof_dates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tenant_id" uuid,
	"domain" varchar(80) NOT NULL,
	"asof" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "error_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"level" varchar(16) DEFAULT 'error',
	"message" text,
	"route" varchar(256),
	"method" varchar(8),
	"status" integer DEFAULT 500,
	"user_email" varchar(320),
	"detail" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integration_issues" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"integration_id" varchar(80),
	"ref" varchar(80),
	"title" varchar(200) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'open',
	"priority" varchar(20) DEFAULT 'medium',
	"field" varchar(80),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issue_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"url" varchar(1024) NOT NULL,
	"label" varchar(240),
	"added_by" varchar(320),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "migrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"tenant_id" uuid,
	"name" varchar(200) NOT NULL,
	"type" varchar(40) DEFAULT 'window',
	"start_at" timestamp with time zone,
	"end_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "request_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route" varchar(256),
	"method" varchar(8),
	"status" integer,
	"dur_ms" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sso_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_name" varchar(200),
	"domain" varchar(200) NOT NULL,
	"provider" varchar(32) DEFAULT 'saml',
	"entity_id" varchar(512),
	"acs_url" varchar(512),
	"metadata_url" varchar(1024),
	"audience" varchar(512),
	"cert_fpr" varchar(128),
	"default_role" varchar(16) DEFAULT 'member',
	"enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sso_settings_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "tenant_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"vendor" varchar(80) DEFAULT 'Workday',
	"environment" varchar(16) DEFAULT 'prod',
	"base_url" varchar(512),
	"wd_short" varchar(80),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
