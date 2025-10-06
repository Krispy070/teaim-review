import { sql } from "drizzle-orm";
import { pgTable, text, varchar, uuid, timestamp, jsonb, integer, boolean, vector, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Organizations table
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
});

// User profiles (extends Supabase auth.users)
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization members with roles
export const orgMembers = pgTable("org_members", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  userId: uuid("user_id").notNull().references(() => profiles.id),
  role: text("role", { enum: ["owner", "admin", "pm", "lead", "member", "guest"] }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Project-level members with roles (for fine-grained access control)
export const projectMembers = pgTable("project_members", {
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  userId: uuid("user_id").notNull().references(() => profiles.id),
  role: text("role", { enum: ["owner", "admin", "pm", "lead", "member", "guest"] }).notNull(),
  canSign: boolean("can_sign").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  pk: sql`PRIMARY KEY (${table.orgId}, ${table.projectId}, ${table.userId})`,
}));

// Projects (WD-CLIENT codes)
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  code: text("code").notNull().unique(), // e.g., WD-ACME-2024
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  status: text("status", { enum: ["discovery", "design", "config", "test", "deploy", "complete"] }).notNull(),
  // Lifecycle management
  lifecycleStatus: text("lifecycle_status", { enum: ["active", "archiving", "archived"] }).default("active"),
  archivedAt: timestamp("archived_at"),
  storageClass: text("storage_class").default("hot"), // 'hot' | 'cold'
  exportZipPath: text("export_zip_path"),
  exportStartedAt: timestamp("export_started_at"),
  exportCompletedAt: timestamp("export_completed_at"),
  bytesUsed: integer("bytes_used").default(0),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  // Ingest alias for email-based document ingestion
  ingestAliasSlug: text("ingest_alias_slug"),
  ingestAliasToken: text("ingest_alias_token"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Artifacts (uploaded documents)
export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  path: text("path").notNull(),
  mimeType: text("mime_type").notNull(),
  source: text("source").notNull(),
  meetingDate: text("meeting_date"), // Parsed from filename (YYYY-MM-DD)
  chunkCount: integer("chunk_count").default(0),
  area: text("area"), // Project area for visibility control (e.g., 'HCM', 'Payroll')
  createdAt: timestamp("created_at").defaultNow(),
});

// Artifact chunks for vector search
export const artifactChunks = pgTable("artifact_chunks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  artifactId: uuid("artifact_id").notNull().references(() => artifacts.id),
  content: text("content").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  embedding: vector("embedding", { dimensions: 3072 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Summaries (auto-generated from documents)
export const summaries = pgTable("summaries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  artifactId: uuid("artifact_id").notNull().references(() => artifacts.id),
  summary: text("summary").notNull(),
  risks: jsonb("risks"),
  decisions: jsonb("decisions"),
  actions: jsonb("actions"),
  provenance: jsonb("provenance"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Actions tracking
export const actions = pgTable("actions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  artifactId: uuid("artifact_id").references(() => artifacts.id),
  title: text("title").notNull(),
  description: text("description"),
  owner: text("owner"),
  verb: text("verb"),
  dueDate: timestamp("due_date"),
  status: text("status", { enum: ["pending", "in_progress", "completed", "overdue"] }).default("pending"),
  area: text("area"), // Project area for visibility control (e.g., 'HCM', 'Payroll')
  extractedFrom: text("extracted_from"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Memory entries (episodic, semantic, procedural, decision, affect)
export const memEntries = pgTable("mem_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  type: text("type", { enum: ["episodic", "semantic", "procedural", "decision", "affect"] }).notNull(),
  content: jsonb("content").notNull(),
  artifactId: uuid("artifact_id").references(() => artifacts.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Memory chunks for RAG
export const memChunks = pgTable("mem_chunks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  memEntryId: uuid("mem_entry_id").notNull().references(() => memEntries.id),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 3072 }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Memory stats (wellness data aggregation)
export const memStats = pgTable("mem_stats", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  weekLabel: text("week_label").notNull(),
  veryNegative: integer("very_negative").default(0),
  negative: integer("negative").default(0),
  neutral: integer("neutral").default(0),
  positive: integer("positive").default(0),
  veryPositive: integer("very_positive").default(0),
  totalResponses: integer("total_responses").default(0),
  avgScore: integer("avg_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Memory signals (wellness alerts)
export const memSignals = pgTable("mem_signals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  signalType: text("signal_type").notNull(),
  severity: text("severity", { enum: ["low", "medium", "high"] }).notNull(),
  message: text("message").notNull(),
  resolved: boolean("resolved").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Workstreams (functional areas/SOW workstreams)
export const workstreams = pgTable("workstreams", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description").default(""),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

// Project exports tracking
export const projectExports = pgTable("project_exports", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  jobStatus: text("job_status", { enum: ["queued", "running", "done", "failed"] }).default("queued"),
  zipPath: text("zip_path"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});

// Project contacts for onboarding
export const projectContacts = pgTable("project_contacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  workstream: text("workstream").default(""),
  createdAt: timestamp("created_at").defaultNow(),
});

// Note: Using auditEvents table for audit trail (see definition below)

// Insert schemas
export const insertOrgSchema = createInsertSchema(orgs).omit({
  id: true,
  createdAt: true,
});

export const insertProfileSchema = createInsertSchema(profiles).omit({
  createdAt: true,
});

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
});

export const insertArtifactSchema = createInsertSchema(artifacts).omit({
  id: true,
  chunkCount: true,
  createdAt: true,
});

export const insertActionSchema = createInsertSchema(actions).omit({
  id: true,
  createdAt: true,
});

export const insertMemStatsSchema = createInsertSchema(memStats).omit({
  id: true,
  createdAt: true,
});

export const insertWorkstreamSchema = createInsertSchema(workstreams).omit({
  id: true,
  createdAt: true,
});

export const insertProjectExportSchema = createInsertSchema(projectExports).omit({
  id: true,
  createdAt: true,
});

export const insertProjectContactSchema = createInsertSchema(projectContacts).omit({
  id: true,
  createdAt: true,
});

export const insertProjectMemberSchema = createInsertSchema(projectMembers).omit({
  createdAt: true,
});

// Onboarding workflows
export const onboardingSteps = pgTable("onboarding_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").unique().notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  orderIdx: integer("order_idx").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const onboardingInstances = pgTable("onboarding_instances", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  stepKey: text("step_key").notNull(),
  status: text("status", { enum: ["pending", "sent", "reminded", "received", "approved"] }).default("pending"),
  dueDate: timestamp("due_date"),
  lastEmailAt: timestamp("last_email_at"),
  responseJson: jsonb("response_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").unique().notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertOnboardingStepSchema = createInsertSchema(onboardingSteps).omit({
  id: true,
  createdAt: true,
});

export const insertOnboardingInstanceSchema = createInsertSchema(onboardingInstances).omit({
  id: true,
  createdAt: true,
});

export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({
  id: true,
  createdAt: true,
});

// Types
export type Org = typeof orgs.$inferSelect;
export type InsertOrg = z.infer<typeof insertOrgSchema>;

export type Profile = typeof profiles.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;

export type OrgMember = typeof orgMembers.$inferSelect;

export type ProjectMember = typeof projectMembers.$inferSelect;
export type InsertProjectMember = z.infer<typeof insertProjectMemberSchema>;

export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export type Artifact = typeof artifacts.$inferSelect;
export type InsertArtifact = z.infer<typeof insertArtifactSchema>;

export type ArtifactChunk = typeof artifactChunks.$inferSelect;

export type Summary = typeof summaries.$inferSelect;

export type Action = typeof actions.$inferSelect;
export type InsertAction = z.infer<typeof insertActionSchema>;

export type MemEntry = typeof memEntries.$inferSelect;
export type MemChunk = typeof memChunks.$inferSelect;

export type MemStats = typeof memStats.$inferSelect;
export type InsertMemStats = z.infer<typeof insertMemStatsSchema>;

export type MemSignal = typeof memSignals.$inferSelect;

export type Workstream = typeof workstreams.$inferSelect;
export type InsertWorkstream = z.infer<typeof insertWorkstreamSchema>;

export type ProjectExport = typeof projectExports.$inferSelect;
export type InsertProjectExport = z.infer<typeof insertProjectExportSchema>;

export type ProjectContact = typeof projectContacts.$inferSelect;
export type InsertProjectContact = z.infer<typeof insertProjectContactSchema>;

export type OnboardingStep = typeof onboardingSteps.$inferSelect;
export type InsertOnboardingStep = z.infer<typeof insertOnboardingStepSchema>;

export type OnboardingInstance = typeof onboardingInstances.$inferSelect;
export type InsertOnboardingInstance = z.infer<typeof insertOnboardingInstanceSchema>;

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;

// Project stages for sign-off workflow
export const projectStages = pgTable("project_stages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: text("title").notNull(),
  area: text("area"), // e.g., 'HCM', 'Payroll', etc. for per-area sign-off authority
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status", { enum: ["pending", "in_review", "signed_off", "rejected"] }).notNull().default("pending"),
  requestedBy: uuid("requested_by").references(() => profiles.id),
  requestedAt: timestamp("requested_at"),
  signoffBy: uuid("signoff_by").references(() => profiles.id),
  signoffDate: timestamp("signoff_date"),
  signoffDecision: text("signoff_decision", { enum: ["approved", "rejected"] }),
  signoffNotes: text("signoff_notes"),
  sortIndex: integer("sort_index").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Audit events for stage activities
export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").references(() => projects.id),
  actorId: uuid("actor_id").references(() => profiles.id),
  kind: text("kind").notNull(), // stage.requested | stage.approved | stage.rejected
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Reindex queue for re-embedding restored files
export const reindexQueue = pgTable("reindex_queue", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  artifactId: uuid("artifact_id").references(() => artifacts.id),
  storedKey: text("stored_key"), // Path to stored file in artifacts bucket
  status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  lastError: text("last_error"),
  scheduledAt: timestamp("scheduled_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project member access controls (per member, per project)
export const projectMemberAccess = pgTable("project_member_access", {
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  userId: uuid("user_id").notNull().references(() => profiles.id),
  canViewAll: boolean("can_view_all").notNull().default(true),
  visibilityAreas: text("visibility_areas").array().default(sql`'{}'`), // e.g., ['HCM','Payroll']
  canSignAll: boolean("can_sign_all").notNull().default(false),
  signAreas: text("sign_areas").array().default(sql`'{}'`), // per-area sign authority
  notifyActions: boolean("notify_actions").notNull().default(true),
  notifyRisks: boolean("notify_risks").notNull().default(true),
  notifyDecisions: boolean("notify_decisions").notNull().default(true),
  notifyReminders: boolean("notify_reminders").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  pk: sql`PRIMARY KEY (${table.orgId}, ${table.projectId}, ${table.userId})`,
}));

// Team subscriptions for fine-grained notifications
export const teamSubscriptions = pgTable("team_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  userId: uuid("user_id").notNull().references(() => profiles.id),
  notifyActions: boolean("notify_actions").notNull().default(true),
  notifyRisks: boolean("notify_risks").notNull().default(true),
  notifyDecisions: boolean("notify_decisions").notNull().default(true),
  notifyReminders: boolean("notify_reminders").notNull().default(true),
  notifyWeekly: boolean("notify_weekly").notNull().default(true),
  notifyMonthly: boolean("notify_monthly").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// External signer tokens (single-use) for Sprint 1 - secure storage
export const signoffTokens = pgTable("signoff_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  stageId: uuid("stage_id").notNull().references(() => projectStages.id),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(), // SHA-256 hash of the actual token
  tokenSuffix: text("token_suffix"), // Last 4 chars for debugging/audit
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Organization communication settings for quiet hours & caps
export const orgCommsSettings = pgTable("org_comms_settings", {
  orgId: uuid("org_id").primaryKey().references(() => orgs.id),
  tz: text("tz").notNull().default("America/Los_Angeles"),
  quietStart: text("quiet_start").default("21:00:00+00:00"),
  quietEnd: text("quiet_end").default("07:00:00+00:00"),
  dailySendCap: integer("daily_send_cap").notNull().default(200),
  // v2.10 specification columns
  quietHoursStart: text("quiet_hours_start"),
  quietHoursEnd: text("quiet_hours_end"),
  timezone: text("timezone").default("UTC"),
  dailyCap: integer("daily_cap").default(500),
  // Weekly digest settings
  weeklyEnabled: boolean("weekly_enabled").default(true),
  weeklyDay: integer("weekly_day").default(4), // 0=Mon, 4=Fri
  weeklyHour: integer("weekly_hour").default(9), // 09:00 local
  // Monthly digest settings  
  monthlyEnabled: boolean("monthly_enabled").default(false),
  monthlyDay: integer("monthly_day").default(1), // 1st of month
  monthlyHour: integer("monthly_hour").default(9),
  // Auto-apply rules for PM Update Monitor
  autoApplyUpdates: boolean("auto_apply_updates").notNull().default(false),
  autoApplyMinConf: numeric("auto_apply_min_conf").notNull().default("0.85"),
});

// Communication send log for tracking email sends
export const commsSendLog = pgTable("comms_send_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").references(() => projects.id),
  kind: text("kind").notNull(), // 'digest' | 'signoff' | 'onboarding' | ...
  toEmail: text("to_email").notNull(),
  periodKey: text("period_key"), // For deduplication: 'wk:2025-03' or 'mo:2025-01'
  createdAt: timestamp("created_at").defaultNow(),
});

// Telemetry events for rate limits & server error tracking
export const telemetryEvents = pgTable("telemetry_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").references(() => orgs.id),
  projectId: uuid("project_id").references(() => projects.id),
  userId: uuid("user_id").references(() => profiles.id),
  kind: text("kind").notNull(), // 'rate_limited' | 'server_error' | ...
  path: text("path"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertProjectStageSchema = createInsertSchema(projectStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProjectMemberAccessSchema = createInsertSchema(projectMemberAccess).omit({
  updatedAt: true,
});

export const insertTeamSubscriptionSchema = createInsertSchema(teamSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAuditEventSchema = createInsertSchema(auditEvents).omit({
  id: true,
  createdAt: true,
});

export const insertSignoffTokenSchema = createInsertSchema(signoffTokens).omit({
  id: true,
  createdAt: true,
});

export const insertOrgCommsSettingsSchema = createInsertSchema(orgCommsSettings);

export const insertCommsSendLogSchema = createInsertSchema(commsSendLog).omit({
  id: true,
  createdAt: true,
});

export const insertTelemetryEventSchema = createInsertSchema(telemetryEvents).omit({
  id: true,
  createdAt: true,
});

export type ProjectStage = typeof projectStages.$inferSelect;
export type InsertProjectStage = z.infer<typeof insertProjectStageSchema>;

export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = z.infer<typeof insertAuditEventSchema>;

export type SignoffToken = typeof signoffTokens.$inferSelect;
export type InsertSignoffToken = z.infer<typeof insertSignoffTokenSchema>;

export type OrgCommsSettings = typeof orgCommsSettings.$inferSelect;
export type InsertOrgCommsSettings = z.infer<typeof insertOrgCommsSettingsSchema>;

export type CommsSendLog = typeof commsSendLog.$inferSelect;
export type InsertCommsSendLog = z.infer<typeof insertCommsSendLogSchema>;

export type TelemetryEvent = typeof telemetryEvents.$inferSelect;
export type InsertTelemetryEvent = z.infer<typeof insertTelemetryEventSchema>;

export type ProjectMemberAccess = typeof projectMemberAccess.$inferSelect;

// Core tables needed by seedMinimal function (improved definitions)
export const areas = pgTable("areas", {
  id: uuid("id").primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  key: varchar("key", { length: 50 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  status: varchar("status", { length: 24 }).notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

export const workbooks = pgTable("workbooks", {
  id: uuid("id").primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  areaId: uuid("area_id").notNull().references(() => areas.id),
  title: varchar("title", { length: 200 }).notNull(),
  metrics: jsonb("metrics").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

export const reports = pgTable("reports", {
  id: uuid("id").primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  areaId: uuid("area_id").notNull().references(() => areas.id),
  type: varchar("type", { length: 64 }).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

export const changes = pgTable("changes", {
  id: uuid("id").primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  areaId: uuid("area_id").notNull().references(() => areas.id),
  kind: varchar("kind", { length: 24 }).notNull(),
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  areaId: uuid("area_id").notNull().references(() => areas.id),
  body: text("body").notNull(),
  author: varchar("author", { length: 120 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

export const releases = pgTable("releases", {
  id: uuid("id").primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: varchar("title", { length: 256 }).notNull(),
  description: text("description"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: uuid("id").primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  title: varchar("title", { length: 200 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: false }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: false }),
  channel: varchar("channel", { length: 24 }).notNull().default("staging"),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().notNull(),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  userId: uuid("user_id").references(() => profiles.id), // NEW: per-user notifications
  title: text("title"),
  kind: varchar("kind", { length: 48 }).notNull(),
  seen: boolean("seen").notNull().default(false),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

export const signoffs = pgTable("signoffs", {
  token: varchar("token", { length: 64 }).primaryKey().notNull(),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  status: varchar("status", { length: 24 }).notNull().default("issued"),
  expiresAt: timestamp("expires_at", { withTimezone: false }),
  createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
});

// Insert schemas for new tables
export const insertAreaSchema = createInsertSchema(areas).omit({
  id: true,
  createdAt: true,
});

export const insertWorkbookSchema = createInsertSchema(workbooks).omit({
  id: true,
  createdAt: true,
});

export const insertReportSchema = createInsertSchema(reports).omit({
  id: true,
  createdAt: true,
});

export const insertChangeSchema = createInsertSchema(changes).omit({
  id: true,
  createdAt: true,
});

export const insertCommentSchema = createInsertSchema(comments).omit({
  id: true,
  createdAt: true,
});

export const insertReleaseSchema = createInsertSchema(releases).omit({
  id: true,
  createdAt: true,
});

export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export const insertSignoffSchema = createInsertSchema(signoffs).omit({
  createdAt: true,
});

// Types for new tables
export type Area = typeof areas.$inferSelect;
export type InsertArea = z.infer<typeof insertAreaSchema>;

export type Workbook = typeof workbooks.$inferSelect;
export type InsertWorkbook = z.infer<typeof insertWorkbookSchema>;

export type Report = typeof reports.$inferSelect;
export type InsertReport = z.infer<typeof insertReportSchema>;

export type Change = typeof changes.$inferSelect;
export type InsertChange = z.infer<typeof insertChangeSchema>;

export type Comment = typeof comments.$inferSelect;
export type InsertComment = z.infer<typeof insertCommentSchema>;

export type Release = typeof releases.$inferSelect;
export type InsertRelease = z.infer<typeof insertReleaseSchema>;

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type Signoff = typeof signoffs.$inferSelect;
export type InsertSignoff = z.infer<typeof insertSignoffSchema>;
export type InsertProjectMemberAccess = z.infer<typeof insertProjectMemberAccessSchema>;

export type TeamSubscription = typeof teamSubscriptions.$inferSelect;
export type InsertTeamSubscription = z.infer<typeof insertTeamSubscriptionSchema>;

// Pending updates for PM Update Monitor (review queue for AI-proposed changes)
export const pendingUpdates = pgTable("pending_updates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  changeType: text("change_type").notNull(), // action|risk|decision|integration|workstream|metric|memory
  operation: text("operation").notNull(), // insert|update|upsert|delete
  targetTable: text("target_table").notNull(), // e.g., 'actions'
  targetId: uuid("target_id"), // null for inserts
  payload: jsonb("payload").notNull(), // proposed fields
  oldSnapshot: jsonb("old_snapshot"), // captured when applying (for undo)
  sourceArtifactId: uuid("source_artifact_id").references(() => artifacts.id),
  sourceSpan: text("source_span"), // optional line/time range
  confidence: numeric("confidence"), // 0..1
  status: text("status", { enum: ["pending", "approved", "applied", "rejected", "failed"] }).notNull().default("pending"),
  error: text("error"),
  createdBy: text("created_by").default("system"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  appliedBy: text("applied_by"),
  appliedAt: timestamp("applied_at"),
});

export const insertPendingUpdateSchema = createInsertSchema(pendingUpdates).omit({
  id: true,
  createdAt: true,
});

export type PendingUpdate = typeof pendingUpdates.$inferSelect;
export type InsertPendingUpdate = z.infer<typeof insertPendingUpdateSchema>;

// Sign-off documents for the comprehensive sign-off system
export const signoffDocs = pgTable("signoff_docs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  stageId: uuid("stage_id").references(() => projectStages.id),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("document"), // document | package | generated
  html: text("html"), // rendered HTML content
  storagePath: text("storage_path"), // path in storage bucket
  status: text("status", { enum: ["draft", "sent", "signed", "rejected"] }).notNull().default("draft"),
  signerEmail: text("signer_email"),
  signedBy: text("signed_by"), // actual signer user ID
  signedName: text("signed_name"), // typed name for e-signature
  signedIp: text("signed_ip"), // IP address when signed
  signedMeta: jsonb("signed_meta"), // browser info, etc.
  signedAt: timestamp("signed_at"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Document tokens for external signing (extends signoff system)
export const signoffDocTokens = pgTable("signoff_doc_tokens", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  docId: uuid("doc_id").notNull().references(() => signoffDocs.id),
  orgId: uuid("org_id").references(() => orgs.id),
  token: text("token").notNull().unique(), // actual token for URL
  signerEmail: text("signer_email").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Risks tracking with area-based visibility (enhanced with M&A fields)
export const risks = pgTable("risks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  artifactId: uuid("artifact_id").references(() => artifacts.id),
  title: text("title").notNull(),
  description: text("description"),
  severity: text("severity", { enum: ["low", "medium", "high", "critical"] }).notNull().default("medium"),
  owner: text("owner"),
  area: text("area"), // Project area for visibility control (e.g., 'HCM', 'Payroll')
  status: text("status", { enum: ["open", "mitigated", "closed"] }).notNull().default("open"),
  extractedFrom: text("extracted_from"),
  // M&A-specific fields
  probability: integer("probability").default(50), // 0..100
  impact: integer("impact").default(2), // 1..5
  severityScore: integer("severity_score").default(0), // computed score
  mitigation: text("mitigation"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  tags: jsonb("tags").$type<string[]>().default([]),
  sourceDocId: uuid("source_doc_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Decisions tracking with area-based visibility  
export const decisions = pgTable("decisions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  artifactId: uuid("artifact_id").references(() => artifacts.id),
  title: text("title").notNull(),
  description: text("description"),
  decidedBy: text("decided_by"),
  area: text("area"), // Project area for visibility control (e.g., 'HCM', 'Payroll')
  status: text("status", { enum: ["pending", "decided", "implemented"] }).notNull().default("pending"),
  extractedFrom: text("extracted_from"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Artifact tags for bulk area assignment and categorization
export const artifactTags = pgTable("artifact_tags", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  artifactId: uuid("artifact_id").notNull().references(() => artifacts.id),
  name: text("name").notNull(), // e.g., "area:HCM", "priority:high"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueTag: sql`UNIQUE (${table.artifactId}, ${table.name})`,
}));

// User preferences for storing server-side user settings
export const userPreferences = pgTable("user_preferences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id").notNull().references(() => profiles.id),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  prefType: text("pref_type").notNull(), // "area_tab", "audit_filters", etc.
  prefKey: text("pref_key").notNull(), // specific preference identifier (e.g., area name for tab)
  prefValue: jsonb("pref_value").notNull(), // flexible JSON storage for preference data
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  uniquePref: sql`UNIQUE (${table.userId}, ${table.orgId}, ${table.projectId}, ${table.prefType}, ${table.prefKey})`,
}));

// Insert schemas for new tables
export const insertSignoffDocSchema = createInsertSchema(signoffDocs).omit({
  id: true,
  createdAt: true,
});

export const insertSignoffDocTokenSchema = createInsertSchema(signoffDocTokens).omit({
  id: true,
  createdAt: true,
});

export const insertRiskSchema = createInsertSchema(risks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDecisionSchema = createInsertSchema(decisions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertArtifactTagSchema = createInsertSchema(artifactTags).omit({
  id: true,
  createdAt: true,
});

export const insertUserPreferenceSchema = createInsertSchema(userPreferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for new tables
export type SignoffDoc = typeof signoffDocs.$inferSelect;
export type InsertSignoffDoc = z.infer<typeof insertSignoffDocSchema>;

export type SignoffDocToken = typeof signoffDocTokens.$inferSelect;
export type InsertSignoffDocToken = z.infer<typeof insertSignoffDocTokenSchema>;

export type Risk = typeof risks.$inferSelect;
export type InsertRisk = z.infer<typeof insertRiskSchema>;

export type Decision = typeof decisions.$inferSelect;
export type InsertDecision = z.infer<typeof insertDecisionSchema>;

export type ArtifactTag = typeof artifactTags.$inferSelect;
export type InsertArtifactTag = z.infer<typeof insertArtifactTagSchema>;

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = z.infer<typeof insertUserPreferenceSchema>;

// Business Processes tracking (per functional area)
export const businessProcesses = pgTable("business_processes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  areaId: uuid("area_id").notNull().references(() => areas.id),
  code: varchar("code", { length: 80 }).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  type: text("type", { enum: ["task", "approval", "sub-process", "integration"] }).notNull().default("task"),
  owner: text("owner"),
  status: text("status", { enum: ["in_scope", "configured", "tested", "signed_off"] }).notNull().default("in_scope"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueCode: sql`UNIQUE (${table.orgId}, ${table.projectId}, ${table.areaId}, ${table.code})`,
}));

// BP Changes tracking for audit trail
export const bpChanges = pgTable("bp_changes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  bpId: uuid("bp_id").notNull().references(() => businessProcesses.id),
  changeType: text("change_type", { enum: ["add", "modify", "remove"] }).notNull().default("modify"),
  description: text("description").notNull(),
  driver: text("driver"),
  configPath: text("config_path"),
  impactedSecurity: jsonb("impacted_security").$type<string[]>().default([]),
  integrationsTouched: jsonb("integrations_touched").$type<string[]>().default([]),
  testCases: jsonb("test_cases").$type<string[]>().default([]),
  effectiveDate: timestamp("effective_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

// BP Steps for detailed process mapping
export const bpSteps = pgTable("bp_steps", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  bpId: uuid("bp_id").notNull().references(() => businessProcesses.id),
  stepNumber: integer("step_number").notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  actor: text("actor"),
  system: text("system"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Test management tables for conversation → test extraction

// Staging tests (pending PM review)
export const stagingTests = pgTable("staging_tests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  transcriptId: uuid("transcript_id"), // future: link to transcript ingestion
  dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  gherkin: text("gherkin").notNull(),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  areaKey: varchar("area_key", { length: 24 }),
  bpCode: varchar("bp_code", { length: 80 }),
  priority: varchar("priority", { length: 4 }).notNull().default("P2"),
  type: varchar("type", { length: 16 }).notNull().default("happy"),
  ownerHint: varchar("owner_hint", { length: 120 }),
  tags: jsonb("tags").$type<string[]>().default([]),
  trace: jsonb("trace").$type<string[]>().notNull().default([]), // transcript quotes
  confidence: numeric("confidence").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueDedupe: sql`UNIQUE (${table.orgId}, ${table.projectId}, ${table.dedupeKey})`,
}));

// Approved test library
export const testsLibrary = pgTable("tests_library", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  areaKey: varchar("area_key", { length: 24 }),
  bpCode: varchar("bp_code", { length: 80 }),
  title: varchar("title", { length: 240 }).notNull(),
  version: integer("version").notNull().default(1),
  gherkin: text("gherkin").notNull(),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  priority: varchar("priority", { length: 4 }).notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  sourceTranscriptId: uuid("source_transcript_id"),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at").defaultNow(),
});

// Test history for versioning
export const testsHistory = pgTable("tests_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  testId: uuid("test_id").notNull().references(() => testsLibrary.id),
  version: integer("version").notNull(),
  diff: jsonb("diff").notNull(), // structured before/after
  reason: text("reason").notNull(), // transcript_correction, manual_edit, etc.
  sourceTranscriptId: uuid("source_transcript_id"),
  committedAt: timestamp("committed_at").defaultNow(),
  committedBy: uuid("committed_by").references(() => profiles.id),
});

// Corrections tracking for transcript-based edits
export const corrections = pgTable("corrections", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  transcriptId: uuid("transcript_id").notNull(),
  itemType: varchar("item_type", { length: 32 }).notNull(), // "test" | "action" | "risk" | ...
  itemId: uuid("item_id").notNull(),
  reason: varchar("reason", { length: 300 }),
  diff: jsonb("diff").notNull(), // { before: {...}, after: {...} }
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectItemIdx: sql`INDEX (${table.projectId}, ${table.itemId})`,
}));

// Supersede history for version management
export const supersedes = pgTable("supersedes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull().references(() => orgs.id),
  projectId: uuid("project_id").notNull().references(() => projects.id),
  itemType: varchar("item_type", { length: 32 }).notNull(), // same types as corrections
  oldId: uuid("old_id").notNull(),
  newId: uuid("new_id").notNull(),
  reason: varchar("reason", { length: 300 }),
  createdBy: uuid("created_by").references(() => profiles.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  projectOldIdx: sql`INDEX (${table.projectId}, ${table.oldId})`,
}));

// Insert schemas for business processes tables
export const insertBusinessProcessSchema = createInsertSchema(businessProcesses).omit({
  id: true,
  createdAt: true,
});

export const insertBpChangeSchema = createInsertSchema(bpChanges).omit({
  id: true,
  createdAt: true,
});

export const insertBpStepSchema = createInsertSchema(bpSteps).omit({
  id: true,
  createdAt: true,
});

// Insert schemas for test management tables
export const insertStagingTestSchema = createInsertSchema(stagingTests).omit({
  id: true,
  createdAt: true,
});

export const insertTestLibrarySchema = createInsertSchema(testsLibrary).omit({
  id: true,
  createdAt: true,
});

export const insertTestHistorySchema = createInsertSchema(testsHistory).omit({
  id: true,
  committedAt: true,
});

export const insertCorrectionSchema = createInsertSchema(corrections).omit({
  id: true,
  createdAt: true,
});

export const insertSupersedeSchema = createInsertSchema(supersedes).omit({
  id: true,
  createdAt: true,
});

// Types for business processes tables
export type BusinessProcess = typeof businessProcesses.$inferSelect;
export type InsertBusinessProcess = z.infer<typeof insertBusinessProcessSchema>;

export type BpChange = typeof bpChanges.$inferSelect;
export type InsertBpChange = z.infer<typeof insertBpChangeSchema>;

export type BpStep = typeof bpSteps.$inferSelect;
export type InsertBpStep = z.infer<typeof insertBpStepSchema>;

// Types for test management tables
export type StagingTest = typeof stagingTests.$inferSelect;
export type InsertStagingTest = z.infer<typeof insertStagingTestSchema>;

export type TestLibrary = typeof testsLibrary.$inferSelect;
export type InsertTestLibrary = z.infer<typeof insertTestLibrarySchema>;

export type TestHistory = typeof testsHistory.$inferSelect;
export type InsertTestHistory = z.infer<typeof insertTestHistorySchema>;

export type Correction = typeof corrections.$inferSelect;
export type InsertCorrection = z.infer<typeof insertCorrectionSchema>;

export type Supersede = typeof supersedes.$inferSelect;
export type InsertSupersede = z.infer<typeof insertSupersedeSchema>;

// Docs table for simplified document ingestion (Drizzle-based)
export const docs = pgTable("docs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: uuid("org_id").notNull(),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 512 }).notNull(),
  mime: varchar("mime", { length: 128 }).notNull(),
  sizeBytes: varchar("size_bytes", { length: 32 }).notNull(),
  storagePath: varchar("storage_path", { length: 1024 }).notNull(),
  fullText: text("full_text"),
  summary: text("summary"),
  keywords: jsonb("keywords").$type<string[]>().default([]),
  meta: jsonb("meta").$type<Record<string, any>>().default({}),
  hasPii: boolean("has_pii").default(false),
  indexedAt: timestamp("indexed_at", { withTimezone: true }),
  parsedAt: timestamp("parsed_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const docChunks = pgTable("doc_chunks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  docId: uuid("doc_id").notNull(),
  projectId: uuid("project_id").notNull(),
  chunkIndex: integer("chunk_index").default(0),
  chunk: text("chunk").notNull(),
  embedding: jsonb("embedding").$type<number[]>(),
  embeddingVec: vector("embedding_vec", { dimensions: 3072 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const embedJobs = pgTable("embed_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  docId: uuid("doc_id").notNull(),
  projectId: uuid("project_id").notNull(),
  status: varchar("status", { length: 24 }).default("pending"),
  attempts: integer("attempts").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const parseJobs = pgTable("parse_jobs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  docId: uuid("doc_id").notNull(),
  projectId: uuid("project_id").notNull(),
  status: varchar("status", { length: 24 }).default("pending"),
  attempts: integer("attempts").default(0),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const timelineEvents = pgTable("timeline_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  docId: uuid("doc_id").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  type: varchar("type", { length: 64 }).default("milestone"),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  confidence: varchar("confidence", { length: 8 }).default("0.7"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueEvent: uniqueIndex("timeline_events_uq").on(
    table.projectId,
    table.title,
    sql`COALESCE(${table.startsAt}, ${table.createdAt})`
  ),
}));

export const actionsTbl = pgTable("actions_extracted", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  docId: uuid("doc_id").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  assignee: varchar("assignee", { length: 128 }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  priority: varchar("priority", { length: 16 }).default("normal"),
  status: varchar("status", { length: 16 }).default("open"),
  confidence: varchar("confidence", { length: 8 }).default("0.7"),
  source: text("source"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const decisionsExtracted = pgTable("decisions_extracted", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  docId: uuid("doc_id").notNull(),
  decision: text("decision").notNull(),
  decidedBy: varchar("decided_by", { length: 128 }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  rationale: text("rationale"),
  confidence: varchar("confidence", { length: 8 }).default("0.7"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const testCases = pgTable("test_cases", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  docId: uuid("doc_id").notNull(),
  title: varchar("title", { length: 256 }).notNull(),
  steps: jsonb("steps").$type<string[]>().default([]),
  expected: text("expected"),
  priority: varchar("priority", { length: 16 }).default("P3"),
  tags: jsonb("tags").$type<string[]>().default([]),
  confidence: varchar("confidence", { length: 8 }).default("0.7"),
  source: text("source"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertDocSchema = createInsertSchema(docs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocChunkSchema = createInsertSchema(docChunks).omit({
  id: true,
  createdAt: true,
});

export const insertEmbedJobSchema = createInsertSchema(embedJobs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type Doc = typeof docs.$inferSelect;
export type InsertDoc = z.infer<typeof insertDocSchema>;

export type DocChunk = typeof docChunks.$inferSelect;
export type InsertDocChunk = z.infer<typeof insertDocChunkSchema>;

export type EmbedJob = typeof embedJobs.$inferSelect;
export type InsertEmbedJob = z.infer<typeof insertEmbedJobSchema>;

// Search queries tracking
export const searchQueries = pgTable("search_queries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  q: text("q").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Project settings for PII policy and other configurations
export const projectSettings = pgTable("project_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull().unique(),
  projectCode: text("project_code"),
  piiMode: varchar("pii_mode", { length: 16 }).default("strict"),
  allowEmailDomains: jsonb("allow_email_domains").$type<string[]>().default([]),
  allowOriginalPreview: boolean("allow_original_preview").default(false),
  ingestToken: text("ingest_token"),
  retentionOriginalDays: integer("retention_original_days").default(0),
  retentionDocDays: integer("retention_doc_days").default(0),
  retentionHardDelete: boolean("retention_hard_delete").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// PII audit (per doc summary snapshot)
export const piiAudit = pgTable("pii_audit", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  docId: uuid("doc_id").notNull(),
  summary: jsonb("summary").$type<Record<string, number>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Inbound emails tracking
export const inboundEmails = pgTable("inbound_emails", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  fromAddr: text("from_addr").notNull(),
  toAddr: text("to_addr").notNull(),
  subject: text("subject"),
  meta: jsonb("meta"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertSearchQuerySchema = createInsertSchema(searchQueries).omit({
  id: true,
  createdAt: true,
});

export type SearchQuery = typeof searchQueries.$inferSelect;
export type InsertSearchQuery = z.infer<typeof insertSearchQuerySchema>;

/** M&A Module Tables */

// Playbook Templates
export const playbookTemplates = pgTable("playbook_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 200 }).notNull(),
  domain: varchar("domain", { length: 64 }).default("M&A"),
  version: varchar("version", { length: 32 }).default("v1"),
  sections: jsonb("sections").$type<any[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Playbooks
export const playbooks = pgTable("playbooks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  templateId: uuid("template_id"),
  name: varchar("name", { length: 200 }).notNull(),
  status: varchar("status", { length: 32 }).default("active"),
  params: jsonb("params").$type<Record<string, any>>().default({}),
  sections: jsonb("sections").$type<any[]>(),
  progressPct: integer("progress_pct").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Systems
export const systems = pgTable("systems", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  key: varchar("key", { length: 64 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  owner: varchar("owner", { length: 120 }),
  criticality: varchar("criticality", { length: 16 }).default("high"),
  securityTier: varchar("security_tier", { length: 16 }).default("restricted"),
  meta: jsonb("meta").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Integrations
export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  sourceSystem: varchar("source_system", { length: 64 }).notNull(),
  targetSystem: varchar("target_system", { length: 64 }).notNull(),
  status: varchar("status", { length: 32 }).default("planned"),
  dependsOn: jsonb("depends_on").$type<string[]>().default([]),
  lastTestResult: jsonb("last_test_result").$type<Record<string, any>>().default({}),
  owner: varchar("owner", { length: 120 }),
  environment: varchar("environment", { length: 32 }),
  testStatus: varchar("test_status", { length: 32 }),
  cutoverStart: timestamp("cutover_start", { withTimezone: true }),
  cutoverEnd: timestamp("cutover_end", { withTimezone: true }),
  runbookUrl: varchar("runbook_url", { length: 512 }),
  notes: text("notes"),
  scheduleCron: varchar("schedule_cron", { length: 120 }),
  timezone: varchar("timezone", { length: 64 }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  slaTarget: varchar("sla_target", { length: 32 }),
  windowLocal: varchar("window_local", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Integration Test Runs
export const integrationTests = pgTable("integration_tests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  integrationId: uuid("integration_id").notNull(),
  environment: varchar("environment", { length: 32 }).default("test"),
  status: varchar("status", { length: 24 }).default("not_started"),
  executedAt: timestamp("executed_at", { withTimezone: true }).defaultNow(),
  notes: text("notes"),
  link: varchar("link", { length: 512 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Dependencies
export const dependencies = pgTable("dependencies", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  blockerType: varchar("blocker_type", { length: 32 }).notNull(),
  blockerId: uuid("blocker_id").notNull(),
  dependentType: varchar("dependent_type", { length: 32 }).notNull(),
  dependentId: uuid("dependent_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Stakeholders
export const stakeholders = pgTable("stakeholders", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 200 }),
  org: varchar("org", { length: 120 }),
  role: varchar("role", { length: 64 }),
  raci: varchar("raci", { length: 1 }),
  meta: jsonb("meta").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Cadences
export const cadences = pgTable("cadences", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  frequency: varchar("frequency", { length: 24 }).default("weekly"),
  dayOfWeek: integer("dow").default(3),
  timeUtc: varchar("time_utc", { length: 8 }).default("17:00"),
  attendees: jsonb("attendees").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Lessons Learned
export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  docId: uuid("doc_id"),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 64 }),
  whatHappened: text("what_happened"),
  recommendation: text("recommendation"),
  tags: jsonb("tags").$type<string[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Playbook items flattened for binding to Actions
export const playbookItems = pgTable("playbook_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  playbookId: uuid("playbook_id").notNull(),
  section: varchar("section", { length: 160 }),
  idx: integer("idx").default(0),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  ownerRole: varchar("owner_role", { length: 64 }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  tags: jsonb("tags").$type<string[]>().default([]),
  status: varchar("status", { length: 24 }).default("open"),
  actionId: uuid("action_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Training Plan (for deployment training management)
export const trainingPlan = pgTable("training_plan", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: uuid("project_id").notNull(),
  module: varchar("module", { length: 120 }),
  workstream: varchar("workstream", { length: 160 }),
  phase: varchar("phase", { length: 160 }),
  topic: varchar("topic", { length: 320 }).notNull(),
  delivery: varchar("delivery", { length: 80 }),
  hours: integer("hours").default(0),
  audience: varchar("audience", { length: 160 }),
  owner: varchar("owner", { length: 120 }),
  status: varchar("status", { length: 24 }).default("planned"),
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  locationUrl: varchar("location_url", { length: 512 }),
  prereqs: text("prereqs"),
  resourcesUrl: varchar("resources_url", { length: 512 }),
  notes: text("notes"),
  reminded24: boolean("reminded_24").default(false),
  reminded1: boolean("reminded_1").default(false),
  sourceSheet: varchar("source_sheet", { length: 120 }),
  meta: jsonb("meta").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Activity audit log (Fix Pack v28)
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  userId: varchar("user_id", { length: 256 }),
  userEmail: varchar("user_email", { length: 320 }),
  action: varchar("action", { length: 64 }).notNull(),
  entity: varchar("entity", { length: 64 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  route: varchar("route", { length: 256 }),
  changes: jsonb("changes").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Worker heartbeats (Fix Pack v29)
export const workerHeartbeat = pgTable("worker_heartbeat", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id"),
  worker: varchar("worker", { length: 64 }).notNull().unique(),
  info: jsonb("info").$type<Record<string, any>>().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Error log (Fix Pack v32)
export const errorLog = pgTable("error_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id"),
  level: varchar("level", { length: 16 }).default("error"),
  message: text("message"),
  route: varchar("route", { length: 256 }),
  method: varchar("method", { length: 8 }),
  status: integer("status").default(500),
  userEmail: varchar("user_email", { length: 320 }),
  detail: jsonb("detail").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Request metrics (Fix Pack v32)
export const requestMetrics = pgTable("request_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  route: varchar("route", { length: 256 }),
  method: varchar("method", { length: 8 }),
  status: integer("status"),
  durMs: integer("dur_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// SSO settings (Fix Pack v33)
export const ssoSettings = pgTable("sso_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgName: varchar("org_name", { length: 200 }),
  domain: varchar("domain", { length: 200 }).notNull().unique(),
  provider: varchar("provider", { length: 32 }).default("saml"),
  entityId: varchar("entity_id", { length: 512 }),
  acsUrl: varchar("acs_url", { length: 512 }),
  metadataUrl: varchar("metadata_url", { length: 1024 }),
  audience: varchar("audience", { length: 512 }),
  certFingerprint: varchar("cert_fpr", { length: 128 }),
  defaultRole: varchar("default_role", { length: 16 }).default("member"),
  enabled: boolean("enabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// API Keys (Fix Pack v34)
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  prefix: varchar("prefix", { length: 16 }).notNull(),
  keyHash: varchar("key_hash", { length: 128 }).notNull(),
  scopes: jsonb("scopes").$type<string[]>().default(sql`'["ingest:write"]'::jsonb`),
  createdByEmail: varchar("created_by_email", { length: 320 }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Tenants (Workday + external) - Fix Pack v40
export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),           // e.g., MARS-PRD
  vendor: varchar("vendor", { length: 80 }).default("Workday"),// Workday|ADP|Custom
  environment: varchar("environment", { length: 16 }).default("prod"), // dev|test|uat|prod|sandbox
  baseUrl: varchar("base_url", { length: 512 }),
  workdayShortName: varchar("wd_short", { length: 80 }),       // e.g., wd2-impl-xxxx
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: sql`INDEX (${table.projectId})`,
}));

// Migration windows (freezes, cutovers) - Fix Pack v40
export const migrations = pgTable("migrations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  tenantId: uuid("tenant_id"),
  name: varchar("name", { length: 200 }).notNull(),            // "Payroll Parallel #1" / "HR Data Freeze"
  type: varchar("type", { length: 40 }).default("window"),     // window|cutover|blackout
  startAt: timestamp("start_at", { withTimezone: true }),
  endAt: timestamp("end_at", { withTimezone: true }),
  meta: jsonb("meta").$type<Record<string, any>>().default(sql`'{}'::jsonb`),// {domain:["HCM","PAY"]...}
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: sql`INDEX (${table.projectId})`,
  tenantIdx: sql`INDEX (${table.tenantId})`,
}));

// Data "as-of" dates (per domain) - Fix Pack v40
export const asOfDates = pgTable("asof_dates", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  tenantId: uuid("tenant_id"),
  domain: varchar("domain", { length: 80 }).notNull(),         // HCM|Payroll|Benefits|FIN|Security|All
  asOf: timestamp("asof", { withTimezone: true }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: sql`INDEX (${table.projectId})`,
  tenantIdx: sql`INDEX (${table.tenantId})`,
}));

// Integration Issues (Fix Pack v42)
export const integrationIssues = pgTable("integration_issues", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => crypto.randomUUID()),
  projectId: uuid("project_id").notNull(),
  integrationId: varchar("integration_id", { length: 80 }),
  ref: varchar("ref", { length: 80 }),
  title: varchar("title", { length: 200 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 20 }).default("open"),    // open|in_progress|resolved
  priority: varchar("priority", { length: 20 }).default("medium"), // low|medium|high|critical
  field: varchar("field", { length: 80 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  projectIdx: sql`INDEX (${table.projectId})`,
  integrationIdx: sql`INDEX (${table.integrationId})`,
}));

// Tenant management Zod schemas (Fix Pack v40)
export const insertTenantSchema = createInsertSchema(tenants).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMigrationSchema = createInsertSchema(migrations).omit({
  id: true,
  createdAt: true,
});

export const insertAsOfDateSchema = createInsertSchema(asOfDates).omit({
  id: true,
  createdAt: true,
});

export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type InsertMigration = z.infer<typeof insertMigrationSchema>;
export type InsertAsOfDate = z.infer<typeof insertAsOfDateSchema>;

export type Tenant = typeof tenants.$inferSelect;
export type Migration = typeof migrations.$inferSelect;
export type AsOfDate = typeof asOfDates.$inferSelect;

// Issue Artifacts (Fix Pack v44)
export const issueArtifacts = pgTable("issue_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  issueId: varchar("issue_id", { length: 36 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  label: varchar("label", { length: 240 }),
  addedBy: varchar("added_by", { length: 320 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Tenant Snapshots (Fix Pack v45)
export const tenantSnapshots = pgTable("tenant_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  data: jsonb("data").$type<Record<string, any>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Alert Settings (Fix Pack v46)
export const alertSettings = pgTable("alert_settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull().unique(),
  recipients: jsonb("recipients").$type<string[]>().default(sql`'[]'::jsonb`),
  errors5mThreshold: integer("errors_5m_threshold").default(5),
  queueStuckMins: integer("queue_stuck_mins").default(15),
  enableTrainingEmails: boolean("enable_training_emails").default(true),
  enableCadenceEmails: boolean("enable_cadence_emails").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Alert State (debounce tracking) (Fix Pack v46)
export const alertState = pgTable("alert_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id"),
  key: varchar("key", { length: 120 }).notNull(),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
});

// Integration Specs (Fix Pack v47)
export const integrationSpecs = pgTable("integration_specs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  integrationId: uuid("integration_id").notNull(),
  name: varchar("name", { length: 240 }).notNull(),
  storagePath: varchar("storage_path", { length: 1024 }),
  contentType: varchar("content_type", { length: 120 }),
  url: varchar("url", { length: 1024 }),
  uploadedBy: varchar("uploaded_by", { length: 320 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Integration Issues Zod schemas (Fix Pack v42)
export const insertIntegrationIssueSchema = createInsertSchema(integrationIssues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationIssue = z.infer<typeof insertIntegrationIssueSchema>;
export type IntegrationIssue = typeof integrationIssues.$inferSelect;

// Integration Runs (Fix Pack v48)
export const integrationRuns = pgTable("integration_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  integrationId: uuid("integration_id").notNull(),
  plannedAt: timestamp("planned_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: varchar("status", { length: 24 }).default("planned"),
  durationMs: integer("duration_ms"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Secrets Vault (Fix Pack v49)
export const secrets = pgTable("secrets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  scope: varchar("scope", { length: 24 }).notNull(),
  refId: uuid("ref_id"),
  keyName: varchar("key_name", { length: 120 }).notNull(),
  ciphertext: varchar("ciphertext", { length: 8192 }).notNull(),
  createdBy: varchar("created_by", { length: 320 }),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertSecretSchema = createInsertSchema(secrets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSecret = z.infer<typeof insertSecretSchema>;
export type Secret = typeof secrets.$inferSelect;

// Webhooks (Fix Pack v51)
export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  type: varchar("type", { length: 24 }).notNull(),
  url: varchar("url", { length: 1024 }).notNull(),
  events: jsonb("events").$type<string[]>().default(sql`'["errors","queue","run_failed","run_success","run_missed_sla"]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertWebhookSchema = createInsertSchema(webhooks).omit({ id: true, createdAt: true });
export type InsertWebhook = z.infer<typeof insertWebhookSchema>;
export type Webhook = typeof webhooks.$inferSelect;

// Daily Briefs (Fix Pack v54)
export const dailyBriefs = pgTable("daily_briefs", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  summary: text("summary"),
  highlights: jsonb("highlights").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertDailyBriefSchema = createInsertSchema(dailyBriefs).omit({ id: true, createdAt: true });
export type InsertDailyBrief = z.infer<typeof insertDailyBriefSchema>;
export type DailyBrief = typeof dailyBriefs.$inferSelect;

// Calendar Connectors (Fix Pack v55)
export const calendarConnectors = pgTable("calendar_connectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  label: varchar("label", { length: 160 }),
  source: varchar("source", { length: 40 }).default("ics"),
  url: varchar("url", { length: 1024 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertCalendarConnectorSchema = createInsertSchema(calendarConnectors).omit({ id: true, createdAt: true });
export type InsertCalendarConnector = z.infer<typeof insertCalendarConnectorSchema>;
export type CalendarConnector = typeof calendarConnectors.$inferSelect;

// Meetings (Fix Pack v55, extended in v57)
export const meetings = pgTable("meetings", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  location: varchar("location", { length: 320 }),
  link: varchar("link", { length: 512 }),
  attendees: jsonb("attendees").$type<string[]>().default(sql`'[]'::jsonb`),
  source: varchar("source", { length: 40 }),
  transcriptText: text("transcript_text"),
  meta: jsonb("meta").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  summary: text("summary"),
  insights: jsonb("insights").$type<{ actions: any[]; decisions: any[]; risks: any[] }>().default(sql`'{"actions":[],"decisions":[],"risks":[]}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertMeetingSchema = createInsertSchema(meetings).omit({ id: true, createdAt: true });
export type InsertMeeting = z.infer<typeof insertMeetingSchema>;
export type Meeting = typeof meetings.$inferSelect;

// Tickets (Fix Pack v56, v61)
export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  source: varchar("source", { length: 24 }).default("manual"),
  sourceId: uuid("source_id"),
  title: varchar("title", { length: 240 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 24 }).default("new"),
  priority: varchar("priority", { length: 16 }).default("med"),
  assignee: varchar("assignee", { length: 160 }),
  externalSystem: varchar("external_system", { length: 24 }),
  externalKey: varchar("external_key", { length: 120 }),
  externalUrl: varchar("external_url", { length: 512 }),
  slaTarget: varchar("sla_target", { length: 64 }),
  // SLA tracking (Fix Pack v61)
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  resolutionAt: timestamp("resolution_at", { withTimezone: true }),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  meta: jsonb("meta").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertTicketSchema = createInsertSchema(tickets).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTicket = z.infer<typeof insertTicketSchema>;
export type Ticket = typeof tickets.$inferSelect;

// Ticket Mailboxes (Fix Pack v60)
export const ticketMailboxes = pgTable("ticket_mailboxes", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  address: varchar("address", { length: 320 }).notNull(),
  token: varchar("token", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Ticket Messages (Fix Pack v60)
export const ticketMessages = pgTable("ticket_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  ticketId: uuid("ticket_id").notNull(),
  direction: varchar("direction", { length: 8 }).default("in"),
  fromEmail: varchar("from_email", { length: 320 }),
  toEmail: varchar("to_email", { length: 320 }),
  subject: varchar("subject", { length: 320 }),
  body: text("body"),
  messageId: varchar("message_id", { length: 512 }),
  inReplyTo: varchar("in_reply_to", { length: 512 }),
  meta: jsonb("meta").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Ticket Attachments (Fix Pack v60)
export const ticketAttachments = pgTable("ticket_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  messageId: uuid("message_id").notNull(),
  name: varchar("name", { length: 240 }),
  contentType: varchar("content_type", { length: 120 }),
  storagePath: varchar("storage_path", { length: 1024 }),
  url: varchar("url", { length: 1024 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Ticket SLA Policies (Fix Pack v61)
export const ticketSlaPolicies = pgTable("ticket_sla_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  priority: varchar("priority", { length: 16 }).notNull(),
  firstResponseMins: integer("first_response_mins").default(240),
  resolutionMins: integer("resolution_mins").default(2880),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  uniqueProjectPriority: uniqueIndex("ticket_sla_policies_project_id_priority_key").on(table.projectId, table.priority)
}));

export const ticketComments = pgTable("ticket_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  ticketId: uuid("ticket_id").notNull(),
  author: varchar("author", { length: 320 }),
  body: text("body"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertTicketCommentSchema = createInsertSchema(ticketComments).omit({ id: true, createdAt: true });
export type InsertTicketComment = z.infer<typeof insertTicketCommentSchema>;
export type TicketComment = typeof ticketComments.$inferSelect;

// Chat Connectors (Fix Pack v68)
export const chatConnectors = pgTable("chat_connectors", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  type: varchar("type", { length: 16 }).notNull(),
  label: varchar("label", { length: 160 }),
  teamId: varchar("team_id", { length: 64 }),
  channelId: varchar("channel_id", { length: 64 }),
  defaultProjectId: uuid("default_project_id"),
  meta: jsonb("meta").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Conversations (Fix Pack v68, v74)
export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  source: varchar("source", { length: 16 }).notNull(),
  sourceRef: varchar("source_ref", { length: 256 }),
  title: varchar("title", { length: 240 }),
  createdBy: varchar("created_by", { length: 320 }),
  summary: text("summary"),
  insights: jsonb("insights").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
  summarizedAt: timestamp("summarized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// Conversation Messages (Fix Pack v68)
export const conversationMessages = pgTable("conversation_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id").notNull(),
  conversationId: uuid("conversation_id").notNull(),
  author: varchar("author", { length: 320 }),
  text: text("text"),
  at: timestamp("at", { withTimezone: true }).defaultNow(),
  meta: jsonb("meta").$type<Record<string, any>>().default(sql`'{}'::jsonb`),
});
