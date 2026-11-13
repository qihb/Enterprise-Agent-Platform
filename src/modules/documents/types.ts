import type { SavedFile } from "../../adapters/storage/local";

export type DocumentStatus = "queued" | "processing" | "ready" | "failed" | "deleted";
export type DocumentRecord = SavedFile & {
  filename: string;
  ownerId: string;
  createdAt: string;
  status: DocumentStatus;
  cleanupPending: boolean;
};
export type DocumentView = Pick<DocumentRecord, "id" | "filename" | "sizeBytes" | "createdAt" | "status" | "cleanupPending">;

export interface DocumentRepository {
  create(record: SavedFile & { filename: string; ownerId: string }): Promise<{ document: DocumentRecord; duplicate: boolean }>;
  list(): Promise<DocumentRecord[]>;
  find(id: string): Promise<DocumentRecord | null>;
  markDeleted(id: string): Promise<DocumentRecord | null>;
  finishCleanup(id: string): Promise<void>;
}

export function documentView(record: DocumentRecord): DocumentView {
  const { id, filename, sizeBytes, createdAt, status, cleanupPending } = record;
  return { id, filename, sizeBytes, createdAt, status, cleanupPending: Boolean(cleanupPending) };
}
