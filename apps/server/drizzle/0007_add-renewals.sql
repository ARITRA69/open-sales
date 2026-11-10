CREATE TYPE "public"."contract_status" AS ENUM('active', 'renewing', 'renewed', 'ended');--> statement-breakpoint
ALTER TYPE "public"."change_record_type" ADD VALUE 'contract';--> statement-breakpoint
CREATE TABLE "contract" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"deal_id" uuid,
	"value_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"starts_on" date NOT NULL,
	"renews_on" date NOT NULL,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"end_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_value_check" CHECK ("contract"."value_minor" >= 0),
	CONSTRAINT "contract_dates_check" CHECK ("contract"."renews_on" > "contract"."starts_on")
);
--> statement-breakpoint
ALTER TABLE "deal" ADD COLUMN "contract_id" uuid;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract" ADD CONSTRAINT "contract_deal_id_deal_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deal"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_upcoming_idx" ON "contract" USING btree ("renews_on","id") WHERE "contract"."status" in ('active', 'renewing');--> statement-breakpoint
CREATE INDEX "contract_company_idx" ON "contract" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_deal_idx" ON "contract" USING btree ("deal_id");--> statement-breakpoint
ALTER TABLE "deal" ADD CONSTRAINT "deal_contract_id_contract_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contract"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deal_contract_idx" ON "deal" USING btree ("contract_id","id") WHERE "deal"."contract_id" is not null;