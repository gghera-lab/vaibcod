CREATE TABLE "analytics_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"name" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_requests" (
	"user_id" integer NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone,
	CONSTRAINT "audio_requests_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "audio_tracks" (
	"id" serial PRIMARY KEY NOT NULL,
	"edition_id" integer NOT NULL,
	"voice_id" text NOT NULL,
	"track_key" text NOT NULL,
	"kind" text NOT NULL,
	"article_key" text,
	"chapter_key" text NOT NULL,
	"title" text NOT NULL,
	"order" integer NOT NULL,
	"path" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"segments" jsonb NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"edition_id" integer NOT NULL,
	"track_key" text NOT NULL,
	"position_ms" integer NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_activity" (
	"user_id" integer NOT NULL,
	"day" date NOT NULL,
	"listened_ms" integer DEFAULT 0 NOT NULL,
	"reviews" integer DEFAULT 0 NOT NULL,
	"quiz_answers" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "daily_activity_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "document_articles" (
	"edition_id" integer NOT NULL,
	"article_key" text NOT NULL,
	"chapter_key" text NOT NULL,
	"kind" text NOT NULL,
	"number" text,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"order" integer NOT NULL,
	"units" jsonb NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plain_text" text NOT NULL,
	CONSTRAINT "document_articles_edition_id_article_key_pk" PRIMARY KEY("edition_id","article_key")
);
--> statement-breakpoint
CREATE TABLE "document_chapters" (
	"edition_id" integer NOT NULL,
	"chapter_key" text NOT NULL,
	"section_title" text NOT NULL,
	"number" integer,
	"title" text NOT NULL,
	"order" integer NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "document_chapters_edition_id_chapter_key_pk" PRIMARY KEY("edition_id","chapter_key")
);
--> statement-breakpoint
CREATE TABLE "document_editions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"edition_key" text NOT NULL,
	"label" text NOT NULL,
	"edition_note" text,
	"source_url" text NOT NULL,
	"source_sha256" text NOT NULL,
	"retrieved_at" date NOT NULL,
	"verified_at" timestamp with time zone,
	"verification_summary" jsonb,
	"is_current" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"document_id" text NOT NULL,
	"article_key" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"kind" text NOT NULL,
	"message" text NOT NULL,
	"context" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"short_title" text NOT NULL,
	"category" text NOT NULL,
	"doc_type" text NOT NULL,
	"number" text,
	"adopted_at" date,
	"publication" text,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"status_note" text,
	"official_url" text,
	"source_name" text,
	"verified_at" date,
	"verification_note" text,
	"audio_status" text DEFAULT 'in_production' NOT NULL,
	"has_text" boolean DEFAULT false NOT NULL,
	"popularity" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_progress" (
	"user_id" integer NOT NULL,
	"document_id" text NOT NULL,
	"edition_id" integer NOT NULL,
	"track_key" text NOT NULL,
	"position_ms" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "listening_progress_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
CREATE TABLE "memory_cards" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"edition_key" text NOT NULL,
	"article_key" text NOT NULL,
	"chapter_key" text NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"answer" jsonb NOT NULL,
	"explanation" text NOT NULL,
	"quote" text NOT NULL,
	"source_ref" text NOT NULL,
	"difficulty" integer DEFAULT 2 NOT NULL,
	"tier" text DEFAULT 'free' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"external_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" text NOT NULL,
	"payload" text NOT NULL,
	"status" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"telegram_charge_id" text,
	"provider_charge_id" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"is_first_recurring" boolean DEFAULT false NOT NULL,
	"subscription_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone,
	"refunded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price_stars" integer NOT NULL,
	"price_rub_hint" integer NOT NULL,
	"period_days" integer NOT NULL,
	"recurring" boolean DEFAULT false NOT NULL,
	"features" jsonb NOT NULL,
	"badge" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"attempt_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"card_id" text NOT NULL,
	"answer" jsonb NOT NULL,
	"is_correct" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quiz_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"scope" text NOT NULL,
	"scope_key" text NOT NULL,
	"edition_key" text NOT NULL,
	"card_ids" jsonb NOT NULL,
	"total" integer NOT NULL,
	"correct" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"card_id" text NOT NULL,
	"grade" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"elapsed_days" real NOT NULL,
	"prev_interval_days" real NOT NULL,
	"new_interval_days" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_states" (
	"user_id" integer NOT NULL,
	"card_id" text NOT NULL,
	"state" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"interval_days" real DEFAULT 0 NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"last_reviewed_at" timestamp with time zone,
	CONSTRAINT "review_states_user_id_card_id_pk" PRIMARY KEY("user_id","card_id")
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"product_id" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"telegram_charge_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "track_progress" (
	"user_id" integer NOT NULL,
	"edition_id" integer NOT NULL,
	"track_key" text NOT NULL,
	"listened_ms" integer DEFAULT 0 NOT NULL,
	"max_position_ms" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"play_count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "track_progress_user_id_edition_id_track_key_pk" PRIMARY KEY("user_id","edition_id","track_key")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" integer PRIMARY KEY NOT NULL,
	"voice_id" text,
	"playback_rate" real DEFAULT 1 NOT NULL,
	"chapter_chime" boolean DEFAULT true NOT NULL,
	"auto_advance" boolean DEFAULT true NOT NULL,
	"notify_reviews" boolean DEFAULT false NOT NULL,
	"notify_audio_releases" boolean DEFAULT true NOT NULL,
	"theme" text DEFAULT 'auto' NOT NULL,
	"daily_goal_min" integer DEFAULT 10 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"first_name" text,
	"last_name" text,
	"username" text,
	"language_code" text,
	"is_dev_user" boolean DEFAULT false NOT NULL,
	"onboarded_at" timestamp with time zone,
	"terms_version" text,
	"terms_accepted_at" timestamp with time zone,
	"analytics_opt_out" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"gender" text NOT NULL,
	"quality" text NOT NULL,
	"license" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"user_id" integer NOT NULL,
	"document_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_user_id_document_id_pk" PRIMARY KEY("user_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_requests" ADD CONSTRAINT "audio_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_requests" ADD CONSTRAINT "audio_requests_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_edition_id_document_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."document_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_tracks" ADD CONSTRAINT "audio_tracks_voice_id_voice_profiles_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."voice_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_edition_id_document_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."document_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_activity" ADD CONSTRAINT "daily_activity_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_articles" ADD CONSTRAINT "document_articles_edition_id_document_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."document_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_chapters" ADD CONSTRAINT "document_chapters_edition_id_document_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."document_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_editions" ADD CONSTRAINT "document_editions_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_progress" ADD CONSTRAINT "listening_progress_edition_id_document_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."document_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_cards" ADD CONSTRAINT "memory_cards_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_attempt_id_quiz_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."quiz_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_card_id_memory_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."memory_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_memory_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."memory_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_states" ADD CONSTRAINT "review_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_states" ADD CONSTRAINT "review_states_card_id_memory_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."memory_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_progress" ADD CONSTRAINT "track_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_progress" ADD CONSTRAINT "track_progress_edition_id_document_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."document_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_document_id_legal_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."legal_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_events_name_idx" ON "analytics_events" USING btree ("name","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_user_idx" ON "analytics_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audio_tracks_uq" ON "audio_tracks" USING btree ("edition_id","voice_id","track_key");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "bookmarks_user_idx" ON "bookmarks" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_editions_doc_key_uq" ON "document_editions" USING btree ("document_id","edition_key");--> statement-breakpoint
CREATE UNIQUE INDEX "favorites_uq" ON "favorites" USING btree ("user_id","document_id","article_key");--> statement-breakpoint
CREATE INDEX "legal_documents_category_idx" ON "legal_documents" USING btree ("category");--> statement-breakpoint
CREATE INDEX "memory_cards_article_idx" ON "memory_cards" USING btree ("article_key");--> statement-breakpoint
CREATE INDEX "notifications_status_idx" ON "notifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_uq" ON "payment_events" USING btree ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_charge_uq" ON "payments" USING btree ("telegram_charge_id");--> statement-breakpoint
CREATE INDEX "payments_payload_idx" ON "payments" USING btree ("payload");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_answers_uq" ON "quiz_answers" USING btree ("attempt_id","card_id");--> statement-breakpoint
CREATE INDEX "quiz_attempts_user_idx" ON "quiz_attempts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "review_logs_user_idx" ON "review_logs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "review_states_due_idx" ON "review_states" USING btree ("user_id","due_at");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_id_uq" ON "users" USING btree ("telegram_id");--> statement-breakpoint
CREATE INDEX "votes_document_idx" ON "votes" USING btree ("document_id");