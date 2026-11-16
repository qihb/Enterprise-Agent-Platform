CREATE SCHEMA eap;
REVOKE ALL ON SCHEMA eap FROM PUBLIC;

CREATE TABLE eap.documents (
  id uuid PRIMARY KEY CHECK (id::text ~ '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'),
  owner_id text NOT NULL CHECK (owner_id <> '' AND owner_id !~ '^[[:space:]]|[[:space:]]$'),
  filename text NOT NULL CHECK (
    length(filename) BETWEEN 1 AND 200 AND filename ~* '\.pdf$'
    AND strpos(filename, '/') = 0 AND strpos(filename, chr(92)) = 0
    AND filename !~ '[[:cntrl:]]'
  ),
  storage_key text NOT NULL UNIQUE CHECK (storage_key = id::text || '.pdf.enc'),
  size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 5 AND 10485760),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  source_type text NOT NULL DEFAULT 'pdf' CHECK (source_type = 'pdf'),
  classification text NOT NULL DEFAULT 'internal' CHECK (classification = 'internal'),
  external_allowed boolean NOT NULL DEFAULT false CHECK (external_allowed = false),
  status text NOT NULL DEFAULT 'stored' CHECK (status IN ('stored','deleted')),
  cleanup_pending boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (NOT cleanup_pending OR status = 'deleted'),
  CHECK ((status = 'stored' AND deleted_at IS NULL) OR (status = 'deleted' AND deleted_at IS NOT NULL)),
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR (deleted_at >= created_at AND deleted_at <= updated_at))
);
CREATE UNIQUE INDEX documents_active_hash ON eap.documents (owner_id, content_hash)
  WHERE status = 'stored';
CREATE INDEX documents_owner_created ON eap.documents (owner_id, created_at DESC, id DESC);
CREATE INDEX documents_cleanup_pending ON eap.documents (updated_at, id) WHERE cleanup_pending = true;

CREATE TABLE eap.document_acl (
  document_id uuid NOT NULL REFERENCES eap.documents(id) ON DELETE RESTRICT,
  subject_id text NOT NULL CHECK (subject_id <> '' AND subject_id !~ '^[[:space:]]|[[:space:]]$'),
  can_read boolean NOT NULL DEFAULT false,
  PRIMARY KEY (document_id, subject_id)
);

CREATE TABLE eap.audit_events (
  id uuid PRIMARY KEY,
  format_version integer NOT NULL DEFAULT 1 CHECK (format_version = 1),
  event_type text NOT NULL CHECK (event_type IN ('document.uploaded','document.deleted')),
  actor_id text NOT NULL CHECK (actor_id <> '' AND actor_id !~ '^[[:space:]]|[[:space:]]$'),
  document_id uuid NOT NULL REFERENCES eap.documents(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, event_type)
);
CREATE INDEX audit_events_document ON eap.audit_events (document_id, created_at, id);

REVOKE ALL ON ALL TABLES IN SCHEMA eap FROM PUBLIC;
GRANT USAGE ON SCHEMA eap TO eap_v1_app;
GRANT SELECT, INSERT ON eap.documents TO eap_v1_app;
GRANT UPDATE (status, cleanup_pending, updated_at, deleted_at) ON eap.documents TO eap_v1_app;
GRANT SELECT, INSERT ON eap.document_acl TO eap_v1_app;
GRANT INSERT ON eap.audit_events TO eap_v1_app;
