CREATE TABLE "join_link" (
	"id" uuid PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"allowed_domain" text,
	"role" text DEFAULT 'member' NOT NULL,
	"created_by_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "join_link_token_unique" UNIQUE("token"),
	CONSTRAINT "join_link_role_check" CHECK ("join_link"."role" = 'member')
);
--> statement-breakpoint
CREATE TABLE "join_request" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"join_link_id" uuid NOT NULL,
	"ticket_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_id" text
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "join_link" ADD CONSTRAINT "join_link_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_join_link_id_join_link_id_fk" FOREIGN KEY ("join_link_id") REFERENCES "public"."join_link"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "join_request" ADD CONSTRAINT "join_request_decided_by_id_user_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "join_link_created_by_idx" ON "join_link" USING btree ("created_by_id");--> statement-breakpoint
CREATE INDEX "join_link_live_idx" ON "join_link" USING btree ("created_at") WHERE "join_link"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "join_request_user_idx" ON "join_request" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "join_request_ticket_idx" ON "join_request" USING btree ("ticket_hash");--> statement-breakpoint
CREATE INDEX "join_request_link_idx" ON "join_request" USING btree ("join_link_id");--> statement-breakpoint
CREATE INDEX "join_request_decided_by_idx" ON "join_request" USING btree ("decided_by_id");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_status_check" CHECK ("user"."status" in ('active', 'pending', 'declined', 'deactivated'));