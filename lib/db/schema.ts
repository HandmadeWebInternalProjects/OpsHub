import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Shared created_at / updated_at columns for every table (PROJECT.md §4). */
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

export const clientStatus = pgEnum("client_status", [
  "active",
  "paused",
  "archived",
]);

export const projectStatus = pgEnum("project_status", [
  "draft",
  "provisioning",
  "deploying",
  "live",
  "failed",
  "archived",
]);

export const cmsType = pgEnum("cms_type", ["payload", "strapi", "other"]);

export const jobType = pgEnum("job_type", [
  "provision_site",
  "trigger_deploy",
  "sync_servers",
  "sync_server_metrics",
  "pull_audit_logs",
  "pull_page_scores",
]);

export const jobStatus = pgEnum("job_status", [
  "pending",
  "running",
  "succeeded",
  "failed",
]);

export const userRole = pgEnum("user_role", ["admin", "engineer", "viewer"]);

export const deployEventType = pgEnum("deploy_event_type", [
  "deploy_started",
  "deploy_completed",
  "deploy_failed",
]);

export const alertRuleType = pgEnum("alert_rule_type", [
  "server_disk_pct",
  "page_score_performance",
  "deploy_failed",
  "audit_login_failed_count",
]);

export const alertChannel = pgEnum("alert_channel", ["webhook", "email"]);

export const alertStatus = pgEnum("alert_status", ["open", "acknowledged"]);

// clients
export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  contactEmail: text("contact_email"),
  notes: text("notes"),
  status: clientStatus("status").notNull().default("active"),
  ...timestamps,
});

// projects (one client may have multiple projects)
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  domain: text("domain").notNull().unique(),
  cmsType: cmsType("cms_type").notNull().default("payload"),
  ploiServerId: integer("ploi_server_id"),
  ploiSiteId: integer("ploi_site_id"),
  cmsUrl: text("cms_url"),
  astroRepoUrl: text("astro_repo_url"),
  cmsRepoUrl: text("cms_repo_url"),
  status: projectStatus("status").notNull().default("draft"),
  provisioningJobId: uuid("provisioning_job_id"),
  ...timestamps,
});

// servers (cached from Ploi)
export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  ploiServerId: integer("ploi_server_id").notNull().unique(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  ipAddress: text("ip_address").notNull(),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  rawJson: jsonb("raw_json"),
  ...timestamps,
});

// metrics_snapshots (lightweight daily rollups)
export const metricsSnapshots = pgTable("metrics_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  serverId: uuid("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  cpuPct: numeric("cpu_pct", { precision: 5, scale: 2 }),
  // Ploi's monitored endpoint reports RAM as a percentage (e.g. "36.32"), not
  // megabytes, so the M5 dashboard charts the percentage here. `ram_used_mb`
  // stays for real MB data if a source for it appears later.
  ramPct: numeric("ram_pct", { precision: 5, scale: 2 }),
  ramUsedMb: integer("ram_used_mb"),
  diskUsedPct: numeric("disk_used_pct", { precision: 5, scale: 2 }),
  loadAvg1m: numeric("load_avg_1m", { precision: 8, scale: 2 }),
  ...timestamps,
});

// page_scores (from Lighthouse CI)
export const pageScores = pgTable("page_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  // Idempotency key for the Lighthouse webhook (M6). The reporter may send its
  // own CI build id; otherwise the endpoint derives it from the payload hash so
  // a repeated identical POST cannot insert a second row.
  externalId: text("external_id").unique(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  url: text("url").notNull(),
  performance: integer("performance").notNull(),
  accessibility: integer("accessibility").notNull(),
  bestPractices: integer("best_practices").notNull(),
  seo: integer("seo").notNull(),
  reportUrl: text("report_url"),
  ...timestamps,
});

// audit_summaries (rolled up from the content backend)
export const auditSummaries = pgTable("audit_summaries", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull().unique(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  eventType: text("event_type").notNull(),
  actor: text("actor"),
  ipAddress: text("ip_address"),
  summary: text("summary").notNull(),
  ...timestamps,
});

// deploy_events (Ploi deployment history per project — M4)
export const deployEvents = pgTable("deploy_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  // Ploi deployment id where known; the idempotency key for completed runs.
  // Nullable because a "started" notification has no deployment id yet.
  externalId: text("external_id").unique(),
  event: deployEventType("event").notNull(),
  status: text("status").notNull(),
  message: text("message"),
  occurredAt: timestamp("occurred_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ...timestamps,
});

// alert_rules (alerting config — M8)
export const alertRules = pgTable("alert_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  // null = fleet-wide (e.g. a disk rule that applies to every server)
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  ruleType: alertRuleType("rule_type").notNull(),
  // null for rules with no numeric bound (deploy_failed).
  threshold: numeric("threshold", { precision: 10, scale: 2 }),
  channel: alertChannel("channel").notNull().default("webhook"),
  // Per-rule webhook URL / email address; null falls back to the env default.
  destination: text("destination"),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

// alerts (fired alerts, with acknowledge state — M8)
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    serverId: uuid("server_id").references(() => servers.id, {
      onDelete: "cascade",
    }),
    // Denormalised for display/filtering without a join.
    ruleType: alertRuleType("rule_type").notNull(),
    status: alertStatus("status").notNull().default("open"),
    title: text("title").notNull(),
    detail: text("detail").notNull(),
    // rule + subject; unique among *open* alerts (partial index below) so a
    // subject can re-fire after its previous alert is acknowledged.
    dedupeKey: text("dedupe_key").notNull(),
    triggeredAt: timestamp("triggered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: text("acknowledged_by"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveryError: text("delivery_error"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("alerts_dedupe_open_unique")
      .on(table.dedupeKey)
      .where(sql`${table.status} = 'open'`),
  ],
);

// jobs (simple DB-backed queue)
export const jobs = pgTable("jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: jobType("type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: jobStatus("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  scheduledFor: timestamp("scheduled_for", { withTimezone: true })
    .notNull()
    .defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ...timestamps,
});

// users (internal team only)
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("viewer"),
  ...timestamps,
});

// integration_config (encrypted secrets)
export const integrationConfig = pgTable("integration_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  encryptedValue: text("encrypted_value").notNull(),
  ...timestamps,
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type DeployEvent = typeof deployEvents.$inferSelect;
export type NewDeployEvent = typeof deployEvents.$inferInsert;
export type MetricsSnapshot = typeof metricsSnapshots.$inferSelect;
export type NewMetricsSnapshot = typeof metricsSnapshots.$inferInsert;
export type PageScore = typeof pageScores.$inferSelect;
export type NewPageScore = typeof pageScores.$inferInsert;
export type AuditSummary = typeof auditSummaries.$inferSelect;
export type NewAuditSummary = typeof auditSummaries.$inferInsert;
export type AlertRule = typeof alertRules.$inferSelect;
export type NewAlertRule = typeof alertRules.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
