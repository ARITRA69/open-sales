CREATE TYPE "public"."lead_status" AS ENUM('new', 'qualified', 'disqualified', 'converted');--> statement-breakpoint
ALTER TYPE "public"."change_record_type" ADD VALUE 'lead';--> statement-breakpoint
CREATE TABLE "lead" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company_name" text,
	"title" text,
	"message" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"owner_id" text,
	"fit_note" text,
	"disqualified_reason" text,
	"converted_company_id" uuid,
	"converted_person_id" uuid,
	"converted_deal_id" uuid,
	"raw" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lead_inbox_idx" ON "lead" USING btree ("status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "lead_owner_status_idx" ON "lead" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "lead_email_idx" ON "lead" USING btree ("email");