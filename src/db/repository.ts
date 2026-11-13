import { randomUUID } from "node:crypto";
import { DocumentError, LOCAL_OWNER } from "../modules/documents/errors";
import type { DocumentRecord, DocumentRepository } from "../modules/documents/types";
import type { SavedFile } from "../adapters/storage/local";

export interface SqlConnection {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: T[] }>;
  release(destroy?: boolean): void;
}
export interface SqlPool {
  connect(): Promise<SqlConnection>;
}

const fields = `d.id, d.filename, d.size_bytes AS "sizeBytes", d.storage_key AS "storageKey",
  d.content_hash AS "contentHash", d.owner_id AS "ownerId", d.status,
  d.created_at::text AS "createdAt", d.cleanup_pending AS "cleanupPending"`;
const visible = `d.owner_id = $1 AND EXISTS (
  SELECT 1 FROM eap.document_acl a WHERE a.document_id = d.id
  AND a.subject_id = $1 AND a.can_read = true)`;

export class PgDocuments implements DocumentRepository {
  constructor(private readonly pool: SqlPool) {}

  private async transaction<T>(run: (client: SqlConnection) => Promise<T>): Promise<T> {
    let client: SqlConnection | undefined;
    let committing = false;
    let destroy = false;
    try {
      client = await this.pool.connect();
      await client.query("BEGIN");
      const result = await run(client);
      committing = true;
      await client.query("COMMIT");
      return result;
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { destroy = true; }
      }
      if (committing) throw new DocumentError("save_uncertain");
      throw error instanceof DocumentError ? error : new DocumentError("database_failed");
    } finally {
      client?.release(destroy);
    }
  }

  async check() {
    let client: SqlConnection | undefined;
    try {
      client = await this.pool.connect();
      const { rows } = await client.query<{ unsafe: boolean }>(`SELECT
        (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole
        OR has_table_privilege(current_user, 'eap.audit_events', 'UPDATE,DELETE,TRUNCATE'))
        AS unsafe FROM pg_roles r WHERE r.rolname = current_user`);
      if (!rows[0] || rows[0].unsafe) throw new DocumentError("not_configured");
    } catch (error) {
      throw error instanceof DocumentError ? error : new DocumentError("database_failed");
    } finally {
      client?.release();
    }
  }

  async create(record: SavedFile & { filename: string; ownerId: string }) {
    return this.transaction(async (client) => {
      const { rows } = await client.query<DocumentRecord>(`INSERT INTO eap.documents AS d
        (id, owner_id, filename, storage_key, size_bytes, content_hash)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (owner_id, content_hash) WHERE status <> 'deleted' DO NOTHING
        RETURNING ${fields}`, [
        record.id, LOCAL_OWNER, record.filename, record.storageKey, record.sizeBytes, record.contentHash,
      ]);
      if (!rows.length) {
        const existing = await client.query<DocumentRecord>(`SELECT ${fields} FROM eap.documents d
          WHERE ${visible} AND d.content_hash = $2 AND d.status <> 'deleted'`, [LOCAL_OWNER, record.contentHash]);
        if (!existing.rows[0]) throw new DocumentError("forbidden");
        return { document: existing.rows[0], duplicate: true };
      }
      await client.query(`INSERT INTO eap.document_acl (document_id, subject_id, can_read)
        VALUES ($1,$2,true)`, [record.id, LOCAL_OWNER]);
      await client.query(`INSERT INTO eap.ingestion_jobs (id, document_id) VALUES ($1,$2)`, [randomUUID(), record.id]);
      await client.query(`INSERT INTO eap.audit_events (id, event_type, actor_id, document_id)
        VALUES ($1,'document.uploaded',$2,$3)`, [randomUUID(), LOCAL_OWNER, record.id]);
      return { document: rows[0], duplicate: false };
    });
  }

  async list() {
    return this.transaction(async (client) => {
      const { rows } = await client.query<DocumentRecord>(`SELECT ${fields} FROM eap.documents d
        WHERE ${visible} AND (d.status <> 'deleted' OR d.cleanup_pending)
        ORDER BY d.created_at DESC, d.id DESC LIMIT 200`, [LOCAL_OWNER]);
      return rows;
    });
  }

  async find(id: string) {
    return this.transaction(async (client) => {
      const { rows } = await client.query<DocumentRecord>(`SELECT ${fields} FROM eap.documents d
        WHERE ${visible} AND d.id = $2 AND d.status <> 'deleted'`, [LOCAL_OWNER, id]);
      return rows[0] ?? null;
    });
  }

  async markDeleted(id: string) {
    return this.transaction(async (client) => {
      const { rows } = await client.query<DocumentRecord>(`UPDATE eap.documents d
        SET status = 'deleted', cleanup_pending = true
        WHERE ${visible} AND d.id = $2 RETURNING ${fields}`, [LOCAL_OWNER, id]);
      if (!rows.length) return null;
      await client.query(`UPDATE eap.ingestion_jobs SET status = 'cancelled', updated_at = now()
        WHERE document_id = $1 AND status IN ('queued','running','failed')`, [id]);
      await client.query(`INSERT INTO eap.audit_events (id, event_type, actor_id, document_id)
        VALUES ($1,'document.deleted',$2,$3)`, [randomUUID(), LOCAL_OWNER, id]);
      return rows[0];
    });
  }

  async finishCleanup(id: string) {
    await this.transaction(async (client) => {
      await client.query(`UPDATE eap.documents d SET cleanup_pending = false
        WHERE ${visible} AND d.id = $2 AND d.status = 'deleted'`, [LOCAL_OWNER, id]);
    });
  }
}
