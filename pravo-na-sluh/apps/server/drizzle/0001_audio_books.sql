CREATE TABLE "audio_books" (
	"edition_id" integer NOT NULL,
	"voice_id" text NOT NULL,
	"path" text NOT NULL,
	"duration_ms" integer NOT NULL,
	"bytes" integer NOT NULL,
	"sha256" text NOT NULL,
	"offsets" jsonb NOT NULL,
	"status" text DEFAULT 'ready' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_books_edition_id_voice_id_pk" PRIMARY KEY("edition_id","voice_id")
);
--> statement-breakpoint
ALTER TABLE "audio_books" ADD CONSTRAINT "audio_books_edition_id_document_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."document_editions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audio_books" ADD CONSTRAINT "audio_books_voice_id_voice_profiles_id_fk" FOREIGN KEY ("voice_id") REFERENCES "public"."voice_profiles"("id") ON DELETE no action ON UPDATE no action;