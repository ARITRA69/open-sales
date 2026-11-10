ALTER TYPE "public"."change_record_type" ADD VALUE 'playbook';--> statement-breakpoint
CREATE TABLE "playbook" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"author_id" text,
	"current_version_id" uuid,
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "playbook_version" (
	"id" uuid PRIMARY KEY NOT NULL,
	"playbook_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"steps" text NOT NULL,
	"blanks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allowed_changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook" ADD CONSTRAINT "playbook_current_version_id_playbook_version_id_fk" FOREIGN KEY ("current_version_id") REFERENCES "public"."playbook_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_version" ADD CONSTRAINT "playbook_version_playbook_id_playbook_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."playbook"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playbook_version" ADD CONSTRAINT "playbook_version_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playbook_name_idx" ON "playbook" USING btree ("name","id") WHERE "playbook"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "playbook_current_version_idx" ON "playbook" USING btree ("current_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "playbook_version_playbook_version_idx" ON "playbook_version" USING btree ("playbook_id","version");--> statement-breakpoint
-- The starter playbooks, so a new server has something to run. They have no
-- author; managers edit, unpublish or archive them like any other. The same
-- text is STARTER_PLAYBOOKS in packages/shared. One statement, so each row
-- can point at the other. Seed rows use v4 ids, which is fine.
WITH starter AS MATERIALIZED (
	SELECT gen_random_uuid() AS playbook_id, gen_random_uuid() AS version_id, s.*
	FROM (VALUES
	('Meeting prep', 'A one-page brief before you meet an account.', '1. Read this record’s timeline: the recent emails, notes and calls, and any open tasks.
2. Say who will be in the meeting and what each person cares about, from what we know. If we know nothing about someone, say so.
3. Say where things stand: the stage, value, close date and next step, and anything we promised that isn’t done yet.
4. Suggest three questions to ask in this {Meeting type}, and the one outcome to aim for.
5. Give me the brief in a few short sections I can read in two minutes, with where you read each fact.
6. If the next step or the close date looks out of date, propose the change. Propose a task for anything I should do before the meeting.', '[{"name":"Meeting type","question":"What kind of meeting is it?","options":["First call","Discovery","Demo","Pricing","Check-in"]}]', '["fields","tasks"]'),
	('Follow-up after a call', 'A recap email, the next step and tasks for what was promised.', '1. Read the notes from the latest call on this record, and the emails before it. If there are no notes from a call yet, say so and stop.
2. Draft a recap email to the people who were on the call: thank them, list the three things they cared about most, and say what happens next and when. Keep it under 150 words and make it sound {Tone}.
3. If the call changed the next step or the close date, propose the new ones on the deal.
4. Propose a task for each thing we promised, with a due date.
5. If they promised us something, propose a task to check on it in {Check back in}.', '[{"name":"Tone","question":"How should the email sound?","options":["Friendly","Formal","Brief"]},{"name":"Check back in","question":"When should we check back if they go quiet?","options":["2 days","3 days","1 week"]}]', '["fields","tasks","email_drafts"]'),
	('Stalled deal check', 'Why a deal has gone quiet, and one thing to do about it.', '1. Look at how long this deal has been in its stage, and when anyone last emailed, called or met.
2. Read the last few emails and notes. Say in two sentences why it has most likely stalled: no reply, waiting on us, nobody who can decide, price, or timing.
3. Check what the stage needs before a deal moves on, and say which parts aren’t done.
4. Suggest one next step that fits. Propose it as the deal’s next step, with a task due this week.
5. If a nudge would help, draft a short, friendly email that is easy to answer. Don’t draft one if we wrote last and it was less than three days ago.
6. If the deal looks dead, say so plainly and propose a new close date instead of leaving the old one.', '[]', '["fields","tasks","email_drafts"]'),
	('Renewal prep', 'How likely they are to renew, and how to open the conversation.', '1. Find when this account’s contract renews and what they pay now.
2. Read the last {Look back} of emails, notes and calls. List what has gone well and what has gone badly, each with where you read it.
3. Say how likely they are to renew (likely, unsure or at risk) and why.
4. Suggest what to offer: renew as it is, grow, or a way to keep them, and what to check with them first.
5. Propose a task to start the renewal conversation, due 60 days before the renewal date, or tomorrow if that has passed.
6. Draft a short email asking for a time to talk about the renewal.', '[{"name":"Look back","question":"How far back should it read?","options":["3 months","6 months","12 months"]}]', '["tasks","email_drafts"]')
	) AS s(name, description, steps, blanks, allowed_changes)
), made AS (
	INSERT INTO "playbook" ("id", "name", "description", "current_version_id", "published_at")
	SELECT playbook_id, name, description, version_id, now() FROM starter
)
INSERT INTO "playbook_version" ("id", "playbook_id", "version", "steps", "blanks", "allowed_changes")
SELECT version_id, playbook_id, 1, steps, blanks::jsonb, allowed_changes::jsonb FROM starter;
