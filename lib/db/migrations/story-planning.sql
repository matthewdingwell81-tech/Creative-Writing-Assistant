CREATE TABLE IF NOT EXISTS story_planning (
  id serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  motivations text NOT NULL DEFAULT '',
  traits text NOT NULL DEFAULT '',
  arc text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  time_label text NOT NULL DEFAULT '',
  position integer NOT NULL DEFAULT 0,
  chapter_id integer REFERENCES chapters(id) ON DELETE SET NULL,
  character_id integer REFERENCES story_planning(id) ON DELETE SET NULL,
  related_character_id integer REFERENCES story_planning(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS story_planning_document_idx ON story_planning(document_id);
