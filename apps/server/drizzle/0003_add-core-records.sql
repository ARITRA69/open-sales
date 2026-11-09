-- Trigram search on names, emails and domains (the GIN gin_trgm_ops indexes below).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."change_action" AS ENUM('create', 'update', 'archive', 'restore', 'purge');--> statement-breakpoint
CREATE TYPE "public"."change_record_type" AS ENUM('company', 'person', 'deal', 'pipeline', 'stage', 'lost_reason', 'user', 'workspace');--> statement-breakpoint
CREATE TYPE "public"."change_via" AS ENUM('app', 'ai_proposal', 'import', 'api', 'system');--> statement-breakpoint
CREATE TYPE "public"."deal_kind" AS ENUM('new', 'renewal');--> statement-breakpoint
CREATE TYPE "public"."deal_person_role" AS ENUM('champion', 'decision_maker', 'evaluator', 'blocker');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."stage_kind" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TABLE "change_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "change_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"via" "change_via" NOT NULL,
	"record_type" "change_record_type" NOT NULL,
	"record_id" text NOT NULL,
	"action" "change_action" NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"owner_id" text NOT NULL,
	"industry" text,
	"description" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "deal" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"stage_id" uuid NOT NULL,
	"status" "deal_status" DEFAULT 'open' NOT NULL,
	"value_minor" bigint,
	"currency" char(3) NOT NULL,
	"close_date" date,
	"next_step" text,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"lost_reason_id" uuid,
	"lost_note" text,
	"kind" "deal_kind" DEFAULT 'new' NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "deal_value_check" CHECK ("deal"."value_minor" is null or "deal"."value_minor" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deal_person" (
	"deal_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" "deal_person_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deal_person_deal_id_person_id_pk" PRIMARY KEY("deal_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "deal_stage_change" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deal_stage_change_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"deal_id" uuid NOT NULL,
	"from_stage_id" uuid,
	"to_stage_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed_by_id" text
);
--> statement-breakpoint
CREATE TABLE "lost_reason" (
	"id" uuid PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"title" text,
	"email" text,
	"phone" text,
	"linkedin_url" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"last_activity_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pipeline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"kind" "stage_kind" DEFAULT 'open' NOT NULL,
	"win_probability" smallint DEFAULT 0 NOT NULL,
	"stalled_after_days" integer,
	"goal" text,
	"exit_criteria" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "stage_win_probability_check" CHECK ("stage"."win_probability" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "currency" char(3) DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "change_log" ADD CONSTRAINT "change_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_stage_id_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_lost_reason_id_lost_reason_id_fk" FOREIGN KEY ("lost_reason_id") REFERENCES "public"."lost_reason"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_person" ADD CONSTRAINT "deal_person_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_person" ADD CONSTRAINT "deal_person_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_change" ADD CONSTRAINT "deal_stage_change_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_change" ADD CONSTRAINT "deal_stage_change_from_stage_id_stage_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_change" ADD CONSTRAINT "deal_stage_change_to_stage_id_stage_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_change" ADD CONSTRAINT "deal_stage_change_changed_by_id_user_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person" ADD CONSTRAINT "person_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage" ADD CONSTRAINT "stage_pipeline_id_pipeline_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipeline"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "change_log_record_idx" ON "change_log" USING btree ("record_type","record_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "change_log_actor_idx" ON "change_log" USING btree ("actor_id","id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "change_log_occurred_idx" ON "change_log" USING brin ("occurred_at");--> statement-breakpoint
CREATE INDEX "company_owner_name_idx" ON "company" USING btree ("owner_id","name","id") WHERE "company"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "company_name_idx" ON "company" USING btree ("name","id") WHERE "company"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "company_last_activity_idx" ON "company" USING btree ("last_activity_at" DESC NULLS LAST,"id") WHERE "company"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "company_domain_idx" ON "company" USING btree ("domain") WHERE "company"."domain" is not null and "company"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "company_name_search_idx" ON "company" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "company_custom_fields_idx" ON "company" USING gin ("custom_fields" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "deal_board_idx" ON "deal" USING btree ("pipeline_id","stage_id","last_activity_at" DESC NULLS LAST,"id") WHERE "deal"."status" = 'open' and "deal"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "deal_owner_status_idx" ON "deal" USING btree ("owner_id","status","close_date") WHERE "deal"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "deal_company_status_idx" ON "deal" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "deal_close_date_idx" ON "deal" USING btree ("close_date") WHERE "deal"."status" = 'open' and "deal"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "deal_stage_entered_idx" ON "deal" USING btree ("stage_entered_at") WHERE "deal"."status" = 'open' and "deal"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "deal_closed_at_idx" ON "deal" USING btree ("closed_at") WHERE "deal"."status" in ('won', 'lost');--> statement-breakpoint
CREATE INDEX "deal_stage_idx" ON "deal" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "deal_lost_reason_idx" ON "deal" USING btree ("lost_reason_id") WHERE "deal"."status" = 'lost';--> statement-breakpoint
CREATE INDEX "deal_name_search_idx" ON "deal" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "deal_custom_fields_idx" ON "deal" USING gin ("custom_fields" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "deal_person_person_idx" ON "deal_person" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "deal_stage_change_deal_idx" ON "deal_stage_change" USING btree ("deal_id","changed_at");--> statement-breakpoint
CREATE INDEX "deal_stage_change_to_idx" ON "deal_stage_change" USING btree ("to_stage_id","changed_at");--> statement-breakpoint
CREATE INDEX "deal_stage_change_from_idx" ON "deal_stage_change" USING btree ("from_stage_id");--> statement-breakpoint
CREATE INDEX "person_company_name_idx" ON "person" USING btree ("company_id","name","id");--> statement-breakpoint
CREATE INDEX "person_name_idx" ON "person" USING btree ("name","id") WHERE "person"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "person_email_idx" ON "person" USING btree ("email") WHERE "person"."email" is not null and "person"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "person_name_search_idx" ON "person" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_email_search_idx" ON "person" USING gin ("email" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "person_custom_fields_idx" ON "person" USING gin ("custom_fields" jsonb_path_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_default_idx" ON "pipeline" USING btree ("is_default") WHERE "pipeline"."is_default";--> statement-breakpoint
CREATE INDEX "stage_pipeline_position_idx" ON "stage" USING btree ("pipeline_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_pipeline_closed_kind_idx" ON "stage" USING btree ("pipeline_id","kind") WHERE "stage"."kind" in ('won', 'lost');--> statement-breakpoint
-- The default pipeline, stages and lost reasons, so a new server is ready to
-- use. Admins change them in Settings. Seed rows use v4 ids, which is fine.
WITH sales AS (
	INSERT INTO "pipeline" ("id", "name", "position", "is_default")
	VALUES (gen_random_uuid(), 'Sales', 0, true)
	RETURNING "id"
)
INSERT INTO "stage" ("id", "pipeline_id", "name", "position", "kind", "win_probability", "stalled_after_days", "goal", "exit_criteria")
SELECT gen_random_uuid(), sales."id", s.name, s.position, s.kind::"stage_kind", s.win_probability, s.stalled_after_days, s.goal, s.exit_criteria
FROM sales, (VALUES
	('Qualified', 0, 'open', 10, 14, 'Confirm they have the problem we solve and someone who can buy.', 'A call is booked with someone who can decide or sponsor.'),
	('Discovery', 1, 'open', 25, 14, 'Learn their needs, budget, timeline and who decides.', 'Needs, budget and timeline are known, and they want a proposal.'),
	('Proposal', 2, 'open', 50, 10, 'Send a proposal that fits what they told us.', 'Pricing is sent and they have responded to it.'),
	('Negotiation', 3, 'open', 75, 10, 'Agree terms and get the contract signed.', 'The contract is signed, or they have said no.'),
	('Won', 4, 'won', 100, NULL, NULL, NULL),
	('Lost', 5, 'lost', 0, NULL, NULL, NULL)
) AS s(name, position, kind, win_probability, stalled_after_days, goal, exit_criteria);--> statement-breakpoint
INSERT INTO "lost_reason" ("id", "label", "position")
SELECT gen_random_uuid(), r.label, r.position
FROM (VALUES
	('Price', 0),
	('Chose a competitor', 1),
	('No budget', 2),
	('Bad timing', 3),
	('No decision', 4),
	('Other', 5)
) AS r(label, position);
