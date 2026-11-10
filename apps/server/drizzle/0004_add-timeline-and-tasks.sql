CREATE TYPE "public"."activity_source" AS ENUM('manual', 'ai', 'email_sync', 'calendar_sync', 'import');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('note', 'call', 'meeting', 'email');--> statement-breakpoint
CREATE TYPE "public"."task_source" AS ENUM('manual', 'ai');--> statement-breakpoint
ALTER TYPE "public"."change_record_type" ADD VALUE 'task';--> statement-breakpoint
ALTER TYPE "public"."change_record_type" ADD VALUE 'activity';--> statement-breakpoint
CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"type" "activity_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"company_id" uuid,
	"deal_id" uuid,
	"author_id" text,
	"source" "activity_source" DEFAULT 'manual' NOT NULL,
	"title" text,
	"body" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "activity_person" (
	"activity_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	CONSTRAINT "activity_person_activity_id_person_id_pk" PRIMARY KEY("activity_id","person_id")
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"notes" text,
	"due_on" date,
	"assignee_id" text NOT NULL,
	"created_by_id" text NOT NULL,
	"company_id" uuid,
	"deal_id" uuid,
	"person_id" uuid,
	"completed_at" timestamp with time zone,
	"source" "task_source" DEFAULT 'manual' NOT NULL,
	"proposal_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_person" ADD CONSTRAINT "activity_person_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_person" ADD CONSTRAINT "activity_person_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_person_id_person_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."person"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_company_idx" ON "activity" USING btree ("company_id","occurred_at" DESC NULLS LAST,"id") WHERE "activity"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "activity_deal_idx" ON "activity" USING btree ("deal_id","occurred_at" DESC NULLS LAST,"id") WHERE "activity"."deal_id" is not null and "activity"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "activity_author_idx" ON "activity" USING btree ("author_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_person_person_idx" ON "activity_person" USING btree ("person_id","activity_id");--> statement-breakpoint
CREATE INDEX "task_assignee_due_idx" ON "task" USING btree ("assignee_id","due_on","id") WHERE "task"."completed_at" is null and "task"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "task_company_idx" ON "task" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "task_deal_idx" ON "task" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "task_person_idx" ON "task" USING btree ("person_id");