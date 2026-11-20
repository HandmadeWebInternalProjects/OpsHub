CREATE TYPE "public"."deploy_event_type" AS ENUM('deploy_started', 'deploy_completed', 'deploy_failed');--> statement-breakpoint
CREATE TABLE "deploy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"external_id" text,
	"event" "deploy_event_type" NOT NULL,
	"status" text NOT NULL,
	"message" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deploy_events_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "deploy_events" ADD CONSTRAINT "deploy_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;