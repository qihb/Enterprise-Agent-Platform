"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { DocumentStatus, DocumentView } from "../../modules/documents/types";
import { MAX_PDF_BYTES } from "../../modules/documents/errors";

export function validateFile(file: Pick<File, "name" | "size" | "type">): string | null {
  if (!/\.pdf$/i.test(file.name) || /[/\\\u0000-\u001f\u007f]/.test(file.name)
    || file.name.length > 200 || (file.type && file.type !== "application/pdf") || file.size < 5) {
    return "请选择有效的 PDF 文件。";
  }
  return file.size > MAX_PDF_BYTES ? "单个 PDF 不能超过 10 MB。" : null;
}

export function formatSize(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;
}

export function statusLabel(status: DocumentStatus, pending: boolean) {
  if (status === "deleted") return pending ? "已停用 · 待清理" : "已删除";
  return { queued: "已保存 · 待处理", processing: "处理中", ready: "可问答", failed: "处理失败" }[status];
}

type ApiError = { error?: { code?: string; message?: string } };

async function fetchList(signal: AbortSignal) {
  const response = await fetch("/api/documents", { cache: "no-store", signal });
  const data = await response.json() as ApiError & { documents?: DocumentView[] };
  return { ok: response.ok, data };
}

export function DocumentWorkspace({ initialUnavailable }: { initialUnavailable: boolean }) {
  const [items, setItems] = useState<DocumentView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(initialUnavailable);
  const [checking, setChecking] = useState(!initialUnavailable);
  const [notice, setNotice] = useState("");
  const [upload, setUpload] = useState<{ name: string; percent: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deleting, setDeleting] = useState<DocumentView | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);
  const [search, setSearch] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const uploadLock = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const applyList = useCallback(({ ok, data }: Awaited<ReturnType<typeof fetchList>>) => {
      if (!ok || !Array.isArray(data.documents)) {
        setUnavailable(data.error?.code === "not_configured");
        setLoaded(false);
        setItems([]);
        setNotice(data.error?.message ?? "资料列表暂不可用，请稍后重试。");
        return;
      }
      setItems(data.documents);
      setLoaded(true);
      setUnavailable(false);
      setNotice("");
  }, []);

  const listFailed = useCallback(() => {
    setLoaded(false);
    setItems([]);
    setNotice("无法连接本地服务，请检查服务是否运行。");
  }, []);

  const load = useCallback(async () => {
    setChecking(true);
    try {
      applyList(await fetchList(AbortSignal.timeout(10000)));
    } catch {
      listFailed();
    } finally {
      setChecking(false);
    }
  }, [applyList, listFailed]);

  useEffect(() => {
    const controller = new AbortController();
    if (!initialUnavailable) {
      void fetchList(AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]))
        .then((result) => { if (!controller.signal.aborted) applyList(result); })
        .catch(() => { if (!controller.signal.aborted) listFailed(); })
        .finally(() => { if (!controller.signal.aborted) setChecking(false); });
    }
    return () => {
      controller.abort();
      if (xhr.current) {
        xhr.current.onload = null;
        xhr.current.onerror = null;
        xhr.current.onabort = null;
        xhr.current.ontimeout = null;
        xhr.current.abort();
      }
    };
  }, [initialUnavailable, applyList, listFailed]);

  useEffect(() => {
    if (deleting) dialog.current?.showModal();
    else dialog.current?.close();
  }, [deleting]);

  function select(file: File | undefined) {
    if (!file || uploadLock.current) return;
    const invalid = validateFile(file);
    if (invalid) { setNotice(invalid); return; }
    if (unavailable || !loaded) {
      setNotice("本地保存尚未配置或服务不可用，文件没有上传。请先重新检查。");
      return;
    }
    setNotice("");
    uploadLock.current = true;
    setUpload({ name: file.name, percent: 0 });
    const request = new XMLHttpRequest();
    xhr.current = request;
    request.open("POST", "/api/documents");
    request.setRequestHeader("Content-Type", "application/pdf");
    request.setRequestHeader("X-File-Name", encodeURIComponent(file.name.normalize("NFC")));
    request.timeout = 60000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setUpload({ name: file.name, percent: Math.round(event.loaded / event.total * 100) });
    };
    const finish = () => { uploadLock.current = false; setUpload(null); xhr.current = null; };
    request.onload = async () => {
      let data: ApiError & { duplicate?: boolean; document?: DocumentView };
      try { data = JSON.parse(request.responseText); } catch { finish(); setNotice("上传响应无效，请刷新列表确认结果。"); return; }
      finish();
      if (request.status >= 200 && request.status < 300 && data.document) {
        await load();
        setNotice(data.duplicate ? "这份资料已存在，没有重复保存。" : "上传成功，资料已保存。解析与问答尚未接入。");
      } else {
        setNotice(data.error?.message ?? "上传未完成，请刷新列表确认后再试。");
      }
    };
    request.onerror = () => { finish(); setNotice("连接中断，请刷新列表确认是否已保存。"); };
    request.ontimeout = () => { finish(); setNotice("上传超时，请刷新列表确认是否已保存。"); };
    request.onabort = () => { finish(); setNotice("上传已取消；若已发送完成，请刷新列表确认保存结果。"); };
    request.send(file);
  }

  async function remove() {
    if (!deleting || busyDelete) return;
    setBusyDelete(true);
    try {
      const response = await fetch(`/api/documents/${deleting.id}`, {
        method: "DELETE", signal: AbortSignal.timeout(10000),
      });
      const data = await response.json() as ApiError & { cleanupPending?: boolean };
      if (!response.ok) { setNotice(data.error?.message ?? "删除未完成，请重试。"); return; }
      setDeleting(null);
      await load();
      setNotice(data.cleanupPending ? "资料已停用，不可读取；文件清理待重试。" : "资料已删除。");
    } catch {
      setNotice("连接中断，请刷新列表确认删除结果。");
    } finally {
      setBusyDelete(false);
    }
  }

  const shown = items.filter((item) => item.filename.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const count = loaded ? String(items.filter((item) => item.status !== "deleted").length).padStart(2, "0") : "--";
  return (
    <main className="workspace document-workspace">
      <header className="masthead">
        <Link className="wordmark" href="/" aria-label="企业 Agent 平台首页">EAP / LOCAL</Link>
        <span className="edition"><span className="local-dot" /> 本地工作空间</span>
      </header>
      <section className="document-intro" aria-labelledby="project-title">
        <div><p className="eyebrow">KNOWLEDGE / 01</p><h1 id="project-title">资料库<span className="title-dot">.</span></h1>
          <p className="summary">从一份 PDF 开始，整理你的知识。</p></div>
        <div className="document-count"><strong>{count}</strong><span>已保存资料</span></div>
      </section>
      <nav className="feature-steps" aria-label="开发进度">
        <span className="current-step">01 上传与管理</span><span>02 读取资料 · 后续</span><span>03 提问与引用 · 后续</span>
      </nav>
      {unavailable ? <aside className="setup-note"><strong>本地保存尚未配置</strong>
        <p>本轮仅完成代码，不变更数据库。配置专用数据库、驱动和文件加密密钥后才能保存资料。</p>
        <a href="#configuration">查看配置说明</a></aside> : null}
      <section className={`upload-zone${dragging ? " dragging" : ""}`} aria-labelledby="upload-title"
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault(); setDragging(false);
          if (event.dataTransfer.files.length > 1) { setNotice("请一次上传一份 PDF。"); return; }
          select(event.dataTransfer.files[0]);
        }}>
        <div className="upload-symbol" aria-hidden="true">↑</div>
        <div className="upload-copy"><h2 id="upload-title">上传 PDF</h2><p>拖拽文件到这里，或从电脑中选择</p>
          <span>仅支持 PDF · 单个文件不超过 10 MB · 仅使用无敏感演示资料</span></div>
        <input ref={input} id="pdf-input" className="file-input" type="file" accept=".pdf,application/pdf"
          aria-label="选择 PDF 文件" disabled={Boolean(upload)}
          onChange={(event) => { select(event.target.files?.[0]); event.target.value = ""; }} />
        <button className="primary-button" disabled={Boolean(upload)} onClick={() => input.current?.click()}>选择文件 <span aria-hidden="true">↗</span></button>
      </section>
      {upload ? <div className="upload-progress" role="status">
        <span>{upload.name} · {upload.percent === 100 ? "正在保存，请稍候" : `上传中 ${upload.percent}%`}</span>
        <progress max={100} value={upload.percent} aria-label="上传进度" />
        <button onClick={() => xhr.current?.abort()}>取消上传</button></div> : null}
      <p className={`operation-notice${notice ? " visible" : ""}`} role="status" aria-live="polite">{notice}</p>
      <section className="document-list" aria-labelledby="list-title">
        <div className="list-heading"><h2 id="list-title">资料列表 <span>{loaded ? items.length : "--"}</span></h2>
          <div className="list-controls"><input type="search" aria-label="搜索文件名" placeholder="搜索文件名" value={search} onChange={(event) => setSearch(event.target.value)} />
            <button className="text-button" onClick={() => { setChecking(true); void load(); }} disabled={checking || Boolean(upload)}>{checking ? "检查中…" : "重新检查"}</button></div></div>
        {loaded && shown.length ? <div className="table-wrap"><table><thead><tr><th>文件名</th><th>大小</th><th>上传时间</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>{shown.map((item) => <tr key={item.id}><td><span className="pdf-label">PDF</span><span className="filename">{item.filename}</span></td>
            <td>{formatSize(item.sizeBytes)}</td><td>{new Date(item.createdAt).toLocaleString("zh-CN", { hour12: false })}</td>
            <td><span className={`status-badge status-${item.status}`}>{statusLabel(item.status, item.cleanupPending)}</span></td>
            <td className="row-actions">{item.status !== "deleted" ? <a href={`/api/documents/${item.id}/file`}>下载</a> : null}
              <button disabled={Boolean(upload) || busyDelete} onClick={() => setDeleting(item)}>{item.cleanupPending ? "重试清理" : "删除"}</button></td></tr>)}</tbody></table></div>
          : <div className="empty-state"><span className="empty-mark" aria-hidden="true">▤</span>
            <h3>{!loaded ? "资料尚未加载" : search ? "没有匹配的资料" : "还没有资料"}</h3>
            <p>{!loaded ? "连接本地保存服务后，你的资料会显示在这里。" : search ? "换个文件名试试。" : "上传第一份 PDF，让知识有一个清晰的起点。"}</p></div>}
        <p className="list-caption">最多展示最近 200 份记录。上传成功仅代表文件已保存，解析与问答尚未接入。</p>
      </section>
      <details className="configuration" id="configuration"><summary>本地保存需要哪些配置？</summary>
        <p>需要专用 PostgreSQL 数据库、获准安装的 pg 驱动、仓库外文件目录，以及服务端文件加密密钥。详细步骤见项目 README。</p>
        <p>本次没有创建数据库、账号或执行迁移。配置缺失时不保存文件，不调用外部 AI，也不会用示例资料代替真实结果。</p></details>
      <footer className="footnote"><span>本机单人演示 · 固定演示身份 · 不开放公网</span><span>Next.js / PostgreSQL</span></footer>
      <dialog ref={dialog} className="delete-dialog" onCancel={(event) => { if (busyDelete) event.preventDefault(); else setDeleting(null); }} aria-labelledby="delete-title">
        <p className="eyebrow">资料管理</p><h2 id="delete-title">{deleting?.cleanupPending ? "重试文件清理？" : "删除这份资料？"}</h2>
        <p className="delete-filename">{deleting?.filename}</p><p>删除后资料立即不可访问。文件清理失败时可以重试。</p>
        <div className="dialog-actions"><button disabled={busyDelete} onClick={() => setDeleting(null)}>取消</button>
          <button className="danger-button" disabled={busyDelete} onClick={() => void remove()}>{busyDelete ? "处理中…" : "确认删除"}</button></div></dialog>
    </main>
  );
}
