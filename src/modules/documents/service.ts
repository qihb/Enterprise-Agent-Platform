import type { FileStorage } from "../../adapters/storage/local";
import { DocumentError, LOCAL_OWNER, UUID } from "./errors";
import { documentView, type DocumentRepository } from "./types";

export class DocumentService {
  constructor(private readonly repository: DocumentRepository, private readonly storage: FileStorage) {}

  async list() {
    return (await this.repository.list()).map(documentView);
  }

  async upload(filename: string, body: ReadableStream<Uint8Array> | null) {
    const saved = await this.storage.save(body);
    let result;
    try {
      result = await this.repository.create({ ...saved, filename, ownerId: LOCAL_OWNER });
    } catch (error) {
      // An interrupted COMMIT may have succeeded. Preserve its file until the database can be reconciled.
      if (!(error instanceof DocumentError && error.code === "save_uncertain")) {
        await this.storage.remove(saved.storageKey).catch(() => {});
      }
      throw error;
    }
    let duplicateCleanupPending = false;
    if (result.duplicate) {
      try { await this.storage.remove(saved.storageKey); }
      catch { duplicateCleanupPending = true; }
    }
    return { document: documentView(result.document), duplicate: result.duplicate, duplicateCleanupPending };
  }

  async file(id: string) {
    if (!UUID.test(id)) throw new DocumentError("not_found");
    const record = await this.repository.find(id);
    if (!record || record.status === "deleted") throw new DocumentError("not_found");
    let data: Buffer;
    try { data = await this.storage.read(record.storageKey); }
    catch (error) {
      if (error instanceof DocumentError && error.code === "not_found") throw new DocumentError("storage_failed");
      throw error;
    }
    // Recheck after I/O so a concurrent deletion cannot expose the old file.
    if (!await this.repository.find(id)) throw new DocumentError("not_found");
    return { data, filename: record.filename };
  }

  async remove(id: string) {
    if (!UUID.test(id)) throw new DocumentError("not_found");
    const record = await this.repository.markDeleted(id);
    if (!record) throw new DocumentError("not_found");
    try {
      await this.storage.remove(record.storageKey);
      await this.repository.finishCleanup(id);
      return { cleanupPending: false };
    } catch {
      return { cleanupPending: true };
    }
  }
}
