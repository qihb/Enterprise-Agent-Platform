CREATE SCHEMA eap;
REVOKE ALL ON SCHEMA eap FROM PUBLIC;

CREATE TABLE eap.documents (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  filename text NOT NULL CHECK (length(filename) BETWEEN 1 AND 200),
  storage_key text NOT NULL UNIQUE,
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 5 AND 10485760),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  source_type text NOT NULL DEFAULT 'pdf' CHECK (source_type = 'pdf'),
  classification text NOT NULL DEFAULT 'internal',
  external_allowed boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','ready','failed','deleted')),
  cleanup_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX documents_active_hash ON eap.documents (owner_id, content_hash)
  WHERE status <> 'deleted';
CREATE INDEX documents_owner_created ON eap.documents (owner_id, created_at DESC, id DESC);

CREATE TABLE eap.document_acl (
  document_id uuid NOT NULL REFERENCES eap.documents(id),
  subject_id text NOT NULL,
  can_read boolean NOT NULL DEFAULT false,
  PRIMARY KEY (document_id, subject_id)
);

CREATE TABLE eap.ingestion_jobs (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL UNIQUE REFERENCES eap.documents(id),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ingestion_jobs_queued ON eap.ingestion_jobs (created_at) WHERE status = 'queued';

CREATE TABLE eap.audit_events (
  id uuid PRIMARY KEY,
  format_version integer NOT NULL DEFAULT 1,
  event_type text NOT NULL CHECK (event_type IN ('document.uploaded','document.deleted')),
  actor_id text NOT NULL,
  document_id uuid NOT NULL REFERENCES eap.documents(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_document ON eap.audit_events (document_id, created_at);

REVOKE ALL ON ALL TABLES IN SCHEMA eap FROM PUBLIC;
GRANT USAGE ON SCHEMA eap TO eap_v1_app;
GRANT SELECT, INSERT, UPDATE ON eap.documents, eap.ingestion_jobs TO eap_v1_app;
GRANT SELECT, INSERT ON eap.document_acl TO eap_v1_app;
GRANT INSERT ON eap.audit_events TO eap_v1_app;
