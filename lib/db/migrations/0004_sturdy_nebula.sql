ALTER TABLE "page_scores" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "page_scores" ADD CONSTRAINT "page_scores_external_id_unique" UNIQUE("external_id");