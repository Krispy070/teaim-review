CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "memory_items" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL,
        "source_type" text NOT NULL,
        "source_id" text,
        "text" text NOT NULL,
        "embedding" vector(1536),
        "created_at" timestamp with time zone DEFAULT now(),
        "pii_tags" jsonb DEFAULT '[]'::jsonb,
        "lineage" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "signals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "project_id" uuid NOT NULL,
        "kind" text NOT NULL,
        "severity" text,
        "owner" text,
        "event_ts" timestamp with time zone NOT NULL,
        "features" jsonb DEFAULT '{}'::jsonb,
        "outcome" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "lessons_learned" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "vertical" text NOT NULL,
        "pattern" jsonb NOT NULL,
        "recommendation" text NOT NULL,
        "support" jsonb DEFAULT '{}'::jsonb,
        "confidence" real DEFAULT 0.0,
        "updated_at" timestamp with time zone DEFAULT now()
);
