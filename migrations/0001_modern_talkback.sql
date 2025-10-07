CREATE TABLE "actions_extracted" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"title" varchar(256) NOT NULL,
	"assignee" varchar(128),
	"due_at" timestamp with time zone,
	"priority" varchar(16) DEFAULT 'normal',
	"status" varchar(16) DEFAULT 'open',
	"confidence" varchar(8) DEFAULT '0.7',
	"source" text,
	"archived_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cadences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"frequency" varchar(24) DEFAULT 'weekly',
	"dow" integer DEFAULT 3,
	"time_utc" varchar(8) DEFAULT '17:00',
	"attendees" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "decisions_extracted" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"decided_by" varchar(128),
	"decided_at" timestamp with time zone,
	"rationale" text,
	"confidence" varchar(8) DEFAULT '0.7',
	"source" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"blocker_type" varchar(32) NOT NULL,
	"blocker_id" uuid NOT NULL,
	"dependent_type" varchar(32) NOT NULL,
	"dependent_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "embed_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inbound_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_addr" text NOT NULL,
	"to_addr" text NOT NULL,
	"subject" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"source_system" varchar(64) NOT NULL,
	"target_system" varchar(64) NOT NULL,
	"status" varchar(32) DEFAULT 'planned',
	"depends_on" jsonb DEFAULT '[]'::jsonb,
	"last_test_result" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"doc_id" uuid,
	"title" varchar(200) NOT NULL,
	"category" varchar(64),
	"what_happened" text,
	"recommendation" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "parse_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doc_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" varchar(24) DEFAULT 'pending',
	"attempts" integer DEFAULT 0,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pii_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playbook_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"playbook_id" uuid NOT NULL,
	"section" varchar(160),
	"idx" integer DEFAULT 0,
	"title" varchar(240) NOT NULL,
	"description" text,
	"owner_role" varchar(64),
	"due_at" timestamp with time zone,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(24) DEFAULT 'open',
	"action_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playbook_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"domain" varchar(64) DEFAULT 'M&A',
	"version" varchar(32) DEFAULT 'v1',
	"sections" jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "playbooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"template_id" uuid,
	"name" varchar(200) NOT NULL,
	"status" varchar(32) DEFAULT 'active',
	"params" jsonb DEFAULT '{}'::jsonb,
	"sections" jsonb,
	"progress_pct" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"project_code" text,
	"pii_mode" varchar(16) DEFAULT 'strict',
	"allow_email_domains" jsonb DEFAULT '[]'::jsonb,
	"allow_original_preview" boolean DEFAULT false,
	"ingest_token" text,
	"retention_original_days" integer DEFAULT 0,
	"retention_doc_days" integer DEFAULT 0,
	"retention_hard_delete" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "project_settings_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "stakeholders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"email" varchar(200),
	"org" varchar(120),
	"role" varchar(64),
	"raci" varchar(1),
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"key" varchar(64) NOT NULL,
	"name" varchar(120) NOT NULL,
	"owner" varchar(120),
	"criticality" varchar(16) DEFAULT 'high',
	"security_tier" varchar(16) DEFAULT 'restricted',
	"meta" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"title" varchar(256) NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb,
	"expected" text,
	"priority" varchar(16) DEFAULT 'P3',
	"tags" jsonb DEFAULT '[]'::jsonb,
	"confidence" varchar(8) DEFAULT '0.7',
	"source" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"doc_id" uuid NOT NULL,
	"title" varchar(256) NOT NULL,
	"type" varchar(64) DEFAULT 'milestone',
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"confidence" varchar(8) DEFAULT '0.7',
	"source" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "doc_chunks" ALTER COLUMN "embedding" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "doc_chunks" ADD COLUMN "chunk_index" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "doc_chunks" ADD COLUMN "embedding_vec" vector(3072);--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "has_pii" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "indexed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "docs" ADD COLUMN "parsed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ingest_alias_slug" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "ingest_alias_token" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "probability" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "impact" integer DEFAULT 2;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "severity_score" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "mitigation" text;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "risks" ADD COLUMN "source_doc_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "timeline_events_uq" ON "timeline_events" USING btree ("project_id","title",COALESCE("starts_at", "created_at"));