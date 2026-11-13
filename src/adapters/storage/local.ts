import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { DocumentError, MAX_PDF_BYTES, UUID } from "../../modules/documents/errors";

export type SavedFile = {
  id: string;
  storageKey: string;
  contentHash: string;
  sizeBytes: number;
};

export interface FileStorage {
  save(body: ReadableStream<Uint8Array> | null): Promise<SavedFile>;
  read(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class LocalStorage implements FileStorage {
  private readonly key: Buffer;
  constructor(private readonly directory: string, encryptionKey: string) {
    if (!/^[a-f0-9]{64}$/i.test(encryptionKey)) throw new DocumentError("not_configured");
    this.key = Buffer.from(encryptionKey, "hex");
  }

  private path(key: string) {
    if (!key.endsWith(".pdf.enc") || !UUID.test(key.slice(0, -8))) {
      throw new DocumentError("not_found");
    }
    return join(this.directory, key);
  }

  private async prepare() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    const inside = relative(await realpath(process.cwd()), await realpath(this.directory));
    // Refuse symlinks and shared writable directories instead of changing their permissions.
    if (info.isSymbolicLink() || !info.isDirectory() || (info.mode & 0o077) !== 0
      || inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) {
      throw new DocumentError("storage_failed");
    }
  }

  async save(body: ReadableStream<Uint8Array> | null, maxBytes = MAX_PDF_BYTES): Promise<SavedFile> {
    if (!body) throw new DocumentError("invalid_pdf");
    const id = randomUUID();
    const storageKey = `${id}.pdf.enc`;
    const temporary = join(this.directory, `${id}.tmp`);
    const reader = body.getReader();
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await this.prepare();
      handle = await open(temporary, "wx", 0o600);
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", this.key, iv);
      await handle.writeFile(Buffer.concat([iv, Buffer.alloc(16)]));
      const hash = createHash("sha256");
      let sizeBytes = 0;
      let header = Buffer.alloc(0);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sizeBytes += value.byteLength;
        if (sizeBytes > maxBytes) throw new DocumentError("too_large");
        if (header.length < 5) header = Buffer.concat([header, value]).subarray(0, 5);
        hash.update(value);
        await handle.writeFile(cipher.update(value));
      }
      if (header.toString("ascii") !== "%PDF-") throw new DocumentError("invalid_pdf");
      await handle.writeFile(cipher.final());
      await handle.write(cipher.getAuthTag(), 0, 16, 12);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporary, this.path(storageKey));
      return { id, storageKey, contentHash: hash.digest("hex"), sizeBytes };
    } catch (error) {
      await reader.cancel().catch(() => {});
      await handle?.close().catch(() => {});
      await unlink(temporary).catch(() => {});
      throw error instanceof DocumentError ? error : new DocumentError("storage_failed");
    } finally {
      reader.releaseLock();
    }
  }

  async read(key: string) {
    const file = this.path(key);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await this.prepare();
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const info = await handle.stat();
      if (!info.isFile() || info.size > MAX_PDF_BYTES + 28 || info.size < 28) {
        throw new DocumentError("storage_failed");
      }
      const encrypted = await handle.readFile();
      const decipher = createDecipheriv("aes-256-gcm", this.key, encrypted.subarray(0, 12));
      decipher.setAuthTag(encrypted.subarray(12, 28));
      return Buffer.concat([decipher.update(encrypted.subarray(28)), decipher.final()]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new DocumentError("not_found");
      throw new DocumentError("storage_failed");
    } finally {
      await handle?.close();
    }
  }

  async remove(key: string) {
    const file = this.path(key);
    try {
      await this.prepare();
      await unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new DocumentError("storage_failed");
    }
  }
}
