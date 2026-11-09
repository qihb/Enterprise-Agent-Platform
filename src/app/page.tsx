export default function Home() {
  return (
    <main className="workspace">
      <header className="masthead">
        <span className="wordmark">EAP / LOCAL</span>
        <span className="edition">V1 · 工程验证</span>
      </header>

      <section className="intro" aria-labelledby="project-title">
        <p className="eyebrow">企业知识与工具访问平台</p>
        <h1 id="project-title">Enterprise Agent Platform</h1>
        <p className="summary">从一个可验证的本地工程开始。</p>
        <a href="#scope" className="scope-link">查看本次范围</a>
      </section>

      <section className="scope" id="scope" aria-labelledby="scope-title">
        <div className="stage">
          <p className="eyebrow">当前阶段 / 02</p>
          <h2 id="scope-title">工程初始化完成</h2>
          <p>
            本页仅用于验证网页工程启动。不读取资料，不连接数据库，
            不调用外部模型。
          </p>
          <span className="local-label">仅供本机单人验证</span>
        </div>

        <div className="capabilities">
          <p className="integration-note">数据库、PDF、本地模型尚未接入</p>
          <dl className="status-list">
            <div><dt>数据库</dt><dd>尚未接入</dd></div>
            <div><dt>PDF 解析</dt><dd>尚未接入</dd></div>
            <div><dt>本地 Embedding</dt><dd>尚未接入</dd></div>
            <div><dt>问答与引用</dt><dd>尚未实现</dd></div>
          </dl>
        </div>
      </section>

      <footer className="footnote">
        <span>网页工程骨架，不代表 V1 业务验收完成。</span>
        <span>Next.js / TypeScript</span>
      </footer>
    </main>
  );
}
