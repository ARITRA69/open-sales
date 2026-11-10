CREATE TYPE "public"."ai_engine" AS ENUM('claude-code', 'codex');--> statement-breakpoint
CREATE TYPE "public"."proposal_kind" AS ENUM('update', 'create', 'archive', 'email_draft');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'approved', 'declined', 'out_of_date', 'undone');--> statement-breakpoint
CREATE TYPE "public"."proposal_target_type" AS ENUM('company', 'person', 'deal', 'task', 'activity');--> statement-breakpoint
CREATE TABLE "proposal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "proposal_kind" NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"target_type" "proposal_target_type" NOT NULL,
	"target_id" uuid,
	"base_version" integer,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"why" text,
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"requested_by_id" text NOT NULL,
	"approver_id" text NOT NULL,
	"engine" "ai_engine" NOT NULL,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decline_reason" text,
	"undo_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "change_log" ADD COLUMN "proposal_id" uuid;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_requested_by_id_user_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_approver_id_user_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal" ADD CONSTRAINT "proposal_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "proposal_waiting_idx" ON "proposal" USING btree ("approver_id","created_at" DESC NULLS LAST,"id") WHERE "proposal"."status" in ('pending', 'out_of_date');--> statement-breakpoint
CREATE INDEX "proposal_target_idx" ON "proposal" USING btree ("target_type","target_id") WHERE "proposal"."status" in ('pending', 'out_of_date');--> statement-breakpoint
CREATE INDEX "proposal_requested_by_idx" ON "proposal" USING btree ("requested_by_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "proposal_status_idx" ON "proposal" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_proposal_id_proposal_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_log_proposal_idx" ON "change_log" USING btree ("proposal_id") WHERE "change_log"."proposal_id" is not null;