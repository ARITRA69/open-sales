# Open Sales: feature list

What the product does, grouped by area. Flows that use these features are in
[user-flows.md](user-flows.md). Decisions behind them are in the root
[CLAUDE.md](../CLAUDE.md).

## How to read this

**Priority**

| Tag    | Meaning                                                 |
| ------ | ------------------------------------------------------- |
| **P0** | First usable release. A small team can run sales on it. |
| **P1** | Next. Makes it worth switching from another CRM.        |
| **P2** | Later. Nice to have, or needs P1 first.                 |

**Who**: Admin, Manager or Member (sales executive). "All" means everyone,
limited by their role. The server enforces roles; the app only hides what a
person can't do.

**AI**: what the AI does for that feature. Every AI change is a _proposal_ a
person approves (see [Proposals and audit](#4-proposals-and-audit)).

## Product principles

1. **AI does the work, people approve.** AI fills in records, drafts emails and
   prepares meetings. Nothing changes until someone says yes.
2. **Your AI, your server.** AI runs on each person's own Claude Code or Codex.
   The data stays on the company's own server.
3. **Capture beats typing.** Data should arrive from email, calendar and call
   notes, not from people filling in forms.
4. **Compact and quick.** A tool people live in all day: dense lists, keyboard
   shortcuts, the AI panel beside the work.

---

## 1. Setup and access

| Feature                  | What it does                                                                                                                                | Who   | AI  | Priority |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ----- | --- | -------- |
| One-command server       | `docker compose up` starts the Sales API and Postgres. Migrations run on start.                                                             | Admin | —   | P0       |
| First-run admin account  | On a server with no accounts, the app asks the first person to create the admin account and name the workspace. Built.                      | Admin | —   | P0       |
| Server address screen    | On first launch the app asks for the company's server address, checks it and remembers it. Built.                                           | All   | —   | P0       |
| Email and password login | Built-in sign-in. Session token kept in the OS keychain. Built.                                                                             | All   | —   | P0       |
| SSO (OIDC)               | Optional sign-in with the company's identity provider.                                                                                      | Admin | —   | P1       |
| Invite teammates         | Invite by email with a role (Admin, Manager, Member). The invite link opens the app or shows how to install it.                             | Admin | —   | P0       |
| AI tool check            | Finds Claude Code or Codex on the machine, shows whether it's signed in and ready, and explains how to fix it. Shown in the sidebar footer. | All   | —   | P0       |
| Getting started list     | A short checklist (connect email, import data, invite team, set stages) with progress, like Attio's "Getting started 4/6".                  | Admin | —   | P1       |
| Workspace switcher       | Connect to more than one server (for people who sell for two companies).                                                                    | All   | —   | P2       |

## 2. Today

The home screen. A queue of work AI has prepared, not a dashboard.

| Feature               | What it does                                                                                                           | Who     | AI                                               | Priority |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------ | -------- |
| Waiting for you       | Proposals waiting for this person, newest first. Approve, change or decline from the list. Count shows in the sidebar. | All     | Creates the proposals                            | P0       |
| Today's meetings      | Meetings from the calendar, each with a "Prepare" action.                                                              | All     | Writes the meeting brief                         | P1       |
| Follow-ups due        | Tasks and promised replies due today or overdue.                                                                       | All     | Finds promises in emails and notes ("by Friday") | P0       |
| Deals needing a nudge | Deals with no activity for longer than their stage allows.                                                             | All     | Explains why it's stalled and suggests a step    | P1       |
| Ask box               | A greeting and an ask box with suggested prompts ("Catch me up on my pipeline", "Who should I call today?").           | All     | Answers                                          | P0       |
| Manager view          | Team-wide version: proposals waiting on anyone, stalled deals by owner.                                                | Manager | Summarises the team's week                       | P1       |

## 3. Ask AI

A panel docked on the right of every screen. It already exists as a prototype
(`components/sales/ask`).

| Feature             | What it does                                                                                                 | Who | AI                  | Priority |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | --- | ------------------- | -------- |
| Context-aware panel | Knows what's on screen ("Looking at Halden Capital") and fills that in.                                      | All | Uses record context | P0       |
| Suggested prompts   | Starter questions that change with the screen and record.                                                    | All | Picks prompts       | P0       |
| Tool picker         | Choose Claude Code or Codex per question. Remembers the last choice.                                         | All | —                   | P0       |
| Visible steps       | Shows what the AI is doing ("Reading 12 emails", "Checking the deal") so people trust the answer.            | All | Reports progress    | P0       |
| Sources             | Every claim links to the email, note or record it came from.                                                 | All | Cites sources       | P0       |
| Proposal cards      | Changes appear as cards with before and after values, a reason, and Approve / Decline. See section 4.        | All | Proposes changes    | P0       |
| Email drafts        | Drafts appear as editable cards with Send and Edit.                                                          | All | Drafts              | P0       |
| Blanks              | A playbook can ask a question before it runs ("Which plan?").                                                | All | —                   | P0       |
| Limit fallback      | If the AI tool runs out of usage partway, the panel says so and offers the other tool, keeping the question. | All | —                   | P0       |
| Chat history        | Past questions listed in the panel and searchable.                                                           | All | —                   | P1       |
| Attach files        | Drop a PDF, spreadsheet or call notes into the question.                                                     | All | Reads files         | P1       |

## 4. Proposals and audit

What makes AI safe to use. The server stores and checks every proposal.

| Feature                  | What it does                                                                                               | Who    | AI           | Priority |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | ------ | ------------ | -------- |
| Server-stored proposals  | A proposal records who asked, which AI tool, why, and the before and after of each field.                  | All    | Creates them | P0       |
| Role check               | The server rejects a proposal the person couldn't make by hand (a Member changing someone else's account). | All    | —            | P0       |
| Approve, change, decline | Approve as is, edit a value then approve, or decline with an optional reason.                              | All    | —            | P0       |
| Conflict check           | If the record changed after the AI proposed, the card shows "Changed since" and asks again.                | All    | —            | P0       |
| Undo                     | Undo an approved change for a short time after.                                                            | All    | —            | P0       |
| Labelled history         | The timeline shows "AI, approved by Asha" so people can tell AI changes from human ones.                   | All    | —            | P0       |
| Audit log                | Every change, who made it and how, searchable and exportable.                                              | Admin  | —            | P1       |
| Auto-apply small changes | Admin setting: let low-risk changes (add a note, add a task) through without approval.                     | Admin  | —            | P2       |
| Ask the owner            | A Member can send a proposal for an account they don't own to its owner to approve.                        | Member | —            | P1       |

## 5. Pipeline

| Feature            | What it does                                                                                           | Who   | AI                                   | Priority |
| ------------------ | ------------------------------------------------------------------------------------------------------ | ----- | ------------------------------------ | -------- |
| Board view         | Columns per stage with a count and total value. Drag a card to move stage.                             | All   | —                                    | P0       |
| List view          | The same deals as a table with sortable columns and inline editing.                                    | All   | —                                    | P0       |
| Quick create       | "New deal" opens a side panel: name, account, stage, value, close date, owner. "Save and add another". | All   | Pre-fills from the current account   | P0       |
| Filters and views  | Filter by owner, stage, close date, value. Save a view. "My deals" by default for Members.             | All   | —                                    | P0       |
| Stalled marker     | A deal shows how many days it's been idle once past its stage's limit.                                 | All   | —                                    | P1       |
| Won and lost       | Closing a deal asks for the reason. Lost reasons feed reports.                                         | All   | Suggests the reason from the history | P0       |
| Multiple pipelines | e.g. New business and Partnerships.                                                                    | Admin | —                                    | P2       |
| Stage nudges       | When evidence suggests a stage change ("Pricing sent"), AI proposes moving the deal.                   | All   | Proposes stage changes               | P1       |

## 6. Records: deals, accounts, people

One layout for every record: fields on the left, timeline in the middle, the AI
panel on the right.

| Feature               | What it does                                                                                       | Who     | AI                                    | Priority |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------- | ------------------------------------- | -------- |
| Accounts              | Companies, each with exactly one owner. Tabs: Overview, Activity, Deals, People, Notes, Files.     | All     | —                                     | P0       |
| People                | Contacts linked to an account, with title, email, phone and last contacted.                        | All     | Fills in titles from email signatures | P0       |
| Deals                 | Value, stage, close date, next step, owner, linked people.                                         | All     | Keeps next step and stage current     | P0       |
| Buying committee      | Mark people on a deal as Champion, Decision maker, Evaluator or Blocker (as Lightfield does).      | All     | Proposes roles from emails and calls  | P1       |
| Timeline              | Emails, meetings, calls, notes, tasks and field changes in one stream, with upcoming items on top. | All     | —                                     | P0       |
| Deal status note      | A short "where it stands" note with files (existing `deal-status-note` component).                 | All     | Drafts the note                       | P0       |
| AI summary            | A summary of the record with when it was written and a refresh button.                             | All     | Writes it                             | P1       |
| Relationship strength | Very strong to No contact, worked out from email and meeting frequency (as Attio does).            | All     | —                                     | P2       |
| Custom fields         | Text, number, money, date, pick list, person. Set up in Settings.                                  | Admin   | —                                     | P1       |
| Reassign owner        | Change an account's owner, optionally with its open deals.                                         | Manager | —                                     | P0       |

## 7. Leads

| Feature    | What it does                                                                           | Who     | AI                                        | Priority |
| ---------- | -------------------------------------------------------------------------------------- | ------- | ----------------------------------------- | -------- |
| Lead inbox | New leads from import, a web form or email, waiting to be worked.                      | All     | —                                         | P0       |
| Assign     | Assign an owner, by hand or round-robin.                                               | Manager | —                                         | P1       |
| Qualify    | Mark as qualified or not, with a reason.                                               | All     | Suggests fit from the company and message | P1       |
| Convert    | Turn a lead into an account, a person and a deal in one step. Spots existing accounts. | All     | Matches duplicates                        | P0       |
| Web form   | A simple form the company can embed on its site.                                       | Admin   | —                                         | P2       |

## 8. Renewals

| Feature       | What it does                                                          | Who | AI                           | Priority |
| ------------- | --------------------------------------------------------------------- | --- | ---------------------------- | -------- |
| Renewal list  | Contracts renewing in the next 30, 60 or 90 days, by date.            | All | —                            | P1       |
| Start renewal | Creates a renewal deal from the contract (existing `renewal-dialog`). | All | Pre-fills from the last deal | P1       |
| Won't renew   | Records why, and closes the contract.                                 | All | —                            | P1       |
| Risk flag     | Flags renewals with quiet accounts or bad signals in emails.          | All | Finds risk signals           | P2       |

## 9. Activity capture

| Feature          | What it does                                                                                                 | Who | AI                                    | Priority |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | --- | ------------------------------------- | -------- |
| Notes            | Write a note on any record.                                                                                  | All | —                                     | P0       |
| Paste call notes | Paste notes from a call. AI proposes field updates, tasks and a follow-up email.                             | All | Turns notes into proposals            | P0       |
| Log a call       | Who, when, outcome, notes.                                                                                   | All | —                                     | P0       |
| Tasks            | Due date, owner, linked record. Shown on Today.                                                              | All | Creates tasks from promises           | P0       |
| Email sync       | Connect Gmail or Outlook. Choose what teammates see: subject and metadata, or metadata only (as Attio does). | All | Reads threads to keep records current | P1       |
| Calendar sync    | Meetings appear on records and Today.                                                                        | All | —                                     | P1       |
| Meeting notes    | Import a transcript or recording summary from a notetaker.                                                   | All | Summarises and proposes updates       | P2       |

## 10. Email

| Feature                    | What it does                                                                                   | Who | AI                  | Priority |
| -------------------------- | ---------------------------------------------------------------------------------------------- | --- | ------------------- | -------- |
| Compose                    | Write from any record: To, Cc, subject, body, attachments. Linked to the record automatically. | All | Drafts from context | P0       |
| Send over SMTP             | Sends through the company's SMTP server (set up by the admin).                                 | All | —                   | P0       |
| Follow-up task             | "Remind me in 3 days if no reply" when sending (as HubSpot does).                              | All | —                   | P1       |
| Templates                  | Saved emails with blanks.                                                                      | All | Fills the blanks    | P1       |
| Send from Gmail or Outlook | Sends from the person's own mailbox once email sync is connected.                              | All | —                   | P1       |

## 11. Playbooks

Shared, reusable AI instructions. Like skills for the sales team.

| Feature           | What it does                                                                                  | Who     | AI             | Priority |
| ----------------- | --------------------------------------------------------------------------------------------- | ------- | -------------- | -------- |
| Playbook library  | List of playbooks: name, what it does, who wrote it, how often it's used.                     | All     | —              | P1       |
| Write a playbook  | Steps in plain language, blanks to ask first, and what it may change (fields, emails, tasks). | Manager | Helps write it | P1       |
| Run from a record | "Run playbook" on a deal or account. Results come back as proposals.                          | All     | Runs it        | P1       |
| Versions          | Edits make a new version; runs record which version they used.                                | Manager | —              | P2       |
| Starter playbooks | Ship a few: Meeting prep, Follow-up after a call, Stalled deal check, Renewal prep.           | All     | —              | P1       |

## 12. Reports

| Feature           | What it does                                                                   | Who     | AI       | Priority |
| ----------------- | ------------------------------------------------------------------------------ | ------- | -------- | -------- |
| Pipeline by stage | Count and value per stage, with conversion between stages (as Pipedrive does). | All     | —        | P0       |
| Won and lost      | Revenue won, win rate and lost reasons over a period.                          | All     | —        | P0       |
| Forecast          | Expected revenue by close month, weighted by stage probability.                | Manager | —        | P1       |
| Activity          | Calls, emails and meetings per person.                                         | Manager | —        | P1       |
| Ask about a chart | "Why did win rate drop?" answered from the data behind the chart.              | All     | Explains | P1       |
| Filters           | Period, owner, pipeline.                                                       | All     | —        | P0       |

## 13. Search, views and bulk actions

| Feature       | What it does                                                                                     | Who | AI  | Priority |
| ------------- | ------------------------------------------------------------------------------------------------ | --- | --- | -------- |
| Global search | ⌘K finds deals, accounts, people and commands.                                                   | All | —   | P0       |
| Saved views   | Save a table's filters, columns and sort. Share with the team.                                   | All | —   | P1       |
| Bulk actions  | Select rows with hover checkboxes; act on them from the float bar (change owner, stage, export). | All | —   | P0       |
| Keyboard      | Shortcuts for common actions; every action reachable without a mouse.                            | All | —   | P1       |

## 14. Import, export and integrations

| Feature        | What it does                                                                                                                                     | Who            | AI                     | Priority |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ---------------------- | -------- |
| CSV import     | Upload, match columns to fields (auto-matched first), choose what to do with duplicates and owners, preview, import (as Apollo and Calendly do). | Admin, Manager | Matches columns        | P0       |
| Import history | Each import listed with its row count; undo an import.                                                                                           | Admin          | —                      | P1       |
| CSV export     | Export any table or view.                                                                                                                        | All            | —                      | P0       |
| HubSpot import | Bring over accounts, people, deals and notes.                                                                                                    | Admin          | —                      | P1       |
| Other CRMs     | Pipedrive, Salesforce, Attio importers.                                                                                                          | Admin          | —                      | P2       |
| Public API     | The same role-checked API the app uses, documented as OpenAPI.                                                                                   | Admin          | —                      | P1       |
| Webhooks       | Notify other systems when records change.                                                                                                        | Admin          | —                      | P2       |
| MCP bridge     | The app gives Claude Code and Codex tools to read and propose changes, signed in as the person.                                                  | All            | Uses it for everything | P0       |

## 15. Settings

| Feature         | What it does                                                                                                                                                                               | Who   | Priority |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | -------- |
| Workspace       | Name, logo, currency, time zone.                                                                                                                                                           | Admin | P0       |
| Pipeline stages | Add, rename, reorder and remove stages. Each has a win probability and a "stalled after N days" limit (as Pipedrive does), plus optional goal and exit criteria the AI uses (as Rox does). | Admin | P0       |
| Lost reasons    | The list shown when closing a deal as lost.                                                                                                                                                | Admin | P0       |
| Custom fields   | Add fields to accounts, people and deals.                                                                                                                                                  | Admin | P1       |
| Users and roles | Invite, change role, deactivate. Shows each person's AI tool status.                                                                                                                       | Admin | P0       |
| Sign-in         | Password rules, SSO (OIDC) setup.                                                                                                                                                          | Admin | P1       |
| AI              | Which AI tools are allowed, auto-apply rules, what AI may read (email bodies or not).                                                                                                      | Admin | P1       |
| Email (SMTP)    | Server, port, sender address, test email.                                                                                                                                                  | Admin | P0       |
| Integrations    | Email and calendar sync, CRM imports, webhooks.                                                                                                                                            | Admin | P1       |
| My settings     | Name, photo, signature, notifications, default AI tool.                                                                                                                                    | All   | P0       |

## 16. Platform

| Feature       | What it does                                                                      | Who   | Priority |
| ------------- | --------------------------------------------------------------------------------- | ----- | -------- |
| Live updates  | Changes by teammates appear without refreshing (WebSockets, Postgres NOTIFY).     | All   | P0       |
| Notifications | In-app: proposals for you, mentions, assignments. Desktop notifications optional. | All   | P1       |
| Auto-update   | The app updates itself from GitHub Releases.                                      | All   | P1       |
| Backups       | Documented Postgres backup and restore for self-hosters.                          | Admin | P1       |
| Upgrades      | Pull a new server image; migrations only add, so upgrades are safe.               | Admin | P0       |

## 17. White label

A self-hosted company can make the product look like its own. Two levels: what
changes from Settings, and what needs the desktop app rebuilt.

**From Settings (no rebuild).** The app loads the brand from the server when it
connects, so every teammate sees it straight away.

| Feature             | What it does                                                                                               | Who   | Priority |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ----- | -------- |
| Product name        | Replaces "Open Sales" everywhere in the app: sidebar, window title, sign-in, empty states.                 | Admin | P1       |
| Logo                | Sidebar and sign-in screen. Light background only, matching the light theme.                               | Admin | P0       |
| Brand colour        | Replaces the graphite primary and accent. The app checks contrast and warns if text would be hard to read. | Admin | P1       |
| AI assistant's name | "Ask Nova" instead of "Ask AI" (as Day AI lets customers name theirs).                                     | Admin | P1       |
| Sign-in screen      | Logo, name and a short welcome line on the server address and sign-in screens.                             | Admin | P1       |
| Emails              | Sender name, reply-to, logo and footer on invites, reminders and notifications.                            | Admin | P1       |
| "Powered by"        | Show or hide "Powered by Open Sales". Hidden is allowed by the MIT licence.                                | Admin | P1       |
| Custom domain       | The server runs on the company's own domain (e.g. `sales.acme.com`). Documented, not built into the app.   | Admin | P0       |

**Rebuilt desktop app.** What the operating system shows comes from the app
bundle itself, so it can't change at runtime.

| Feature           | What it does                                                                                                  | Who   | Priority |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ----- | -------- |
| Brand config file | One file holds the app name, bundle id, icon, colours and update feed. Nothing else needs editing to rebrand. | Admin | P2       |
| Branded build     | A build script makes Mac and Windows installers with that name and icon in the dock, menu bar and taskbar.    | Admin | P2       |
| Own update feed   | The branded app updates from the company's own GitHub Releases (or another feed), not the main project's.     | Admin | P2       |
| Own signing       | Sign with the company's Apple and Windows certificates so installs don't show security warnings.              | Admin | P2       |
| Locked server     | Optionally build the company's server address into the app, so teammates skip the address screen.             | Admin | P2       |

---

## Open questions

1. **Server-side AI.** Allow an admin to add their own API key so background jobs
   (overnight lead triage, summaries after calls) run without anyone's laptop
   open? Today's rule says the app never pays for or proxies AI.
2. **Auto-apply.** Should small changes ever skip approval (listed as P2 above)?
3. **Ask the owner.** Should Members be able to send proposals to another
   owner's account, or only read it?
4. **Email content.** By default, should teammates see email subjects, or
   metadata only?
5. **White-label scope.** Should a branded server be able to require its
   branded app, or keep accepting the standard Open Sales app too?

## References (Mobbin)

- Onboarding and workspace setup: [Attio](https://mobbin.com/flows/33785144-9ef2-4b1a-8a1c-27c13ce0e1c6?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)
- CSV import: [Apollo](https://mobbin.com/flows/2eb0884f-5123-4de0-8f77-af07565397b0?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Calendly](https://mobbin.com/flows/07bcc487-28a9-4494-8b9f-348303c1c39c?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Quo](https://mobbin.com/flows/39d0d522-6c67-4872-9d65-d3c5631d5069?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)
- Deals and pipeline: [Attio](https://mobbin.com/flows/82eb7e3e-47a1-47c7-abb4-e133f5de31b4?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Apollo](https://mobbin.com/flows/9e3e41d6-7e8a-496b-8166-5af26491336a?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Outseta](https://mobbin.com/flows/3b14957f-0fcd-42a7-b7c4-14097c48a6e1?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)
- AI chat: [Lightfield](https://mobbin.com/flows/dd5f15d4-ed08-4143-bb70-849b090fe68f?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Fireflies](https://mobbin.com/flows/65275e70-7b71-4bc8-9d23-83586b90dc82?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)
- Pipeline stages: [Rox](https://mobbin.com/flows/b8f72044-a053-4d8f-8987-9aca0aafb212?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Pipedrive](https://mobbin.com/flows/7af3e990-8b92-4728-bcfa-88b2679473c3?tab=screens&utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)
- Reports: [Pipedrive](https://mobbin.com/screens/e05957c0-f43c-4baf-b7d1-dbe0d268bced?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp), [Zoho CRM](https://mobbin.com/screens/b5725d17-0db4-4b37-95ef-4b43aa9aab1a?utm_source=claude&utm_medium=ai-assistant&utm_source_platform=mcp)
