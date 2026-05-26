import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderMarkdownToHtml, renderMarkdown, courseCss, siteHeader, siteMeta, absoluteUrl, escapeHtml } from './md-renderer.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const publicRoot = path.join(root, 'public')

const inputPath = process.env.KNOWLEDGE_MD || path.resolve(root, '..', '..', '2html.md')
const outPath = path.join(publicRoot, 'knowledge', '2html', 'index.html')

main()

function main() {
  if (!fs.existsSync(inputPath)) {
    throw new Error(`missing input markdown: ${inputPath}`)
  }

  const raw = fs.readFileSync(inputPath, 'utf8')
  const title = extractTitle(raw) || '知识点整理'
  const description = '从 Markdown 生成的知识点单页，包含目录、要点卡片、公式渲染。'

  const normalized = normalizeMarkdownForStudy(raw)
  const rendered = renderMarkdown(normalized, { tocLevels: [2, 3, 4], indent: '      ' })
  const tocHtml = renderToc(rendered.toc)

  const body = `
<div class="knowledge-layout">
  <aside class="knowledge-rail" aria-label="目录">
    <div class="knowledge-rail-inner">
      <h2 class="rail-title">目录</h2>
      ${tocHtml}
      <div class="rail-tools">
        <button class="rail-button" type="button" data-action="expand">展开全部</button>
        <button class="rail-button" type="button" data-action="collapse">折叠全部</button>
        <a class="rail-link" href="${escapeHtml(absoluteUrl('/'))}">Home</a>
      </div>
    </div>
  </aside>
  <main class="knowledge-main shell">
    <header class="knowledge-head">
      <p class="knowledge-kicker">Knowledge Page</p>
      <h1 class="knowledge-title">${escapeHtml(title)}</h1>
      <p class="knowledge-desc">${escapeHtml(description)}</p>
    </header>
    <section class="knowledge-content">
${rendered.html}
    </section>
  </main>
</div>
<script>
(() => {
  const root = document.documentElement;
  const setAll = (open) => {
    const nodes = Array.from(document.querySelectorAll('details.know'));
    for (const node of nodes) node.open = open;
  };
  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const action = target.getAttribute('data-action');
    if (action === 'expand') setAll(true);
    if (action === 'collapse') setAll(false);
  });
})();
</script>
`

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, renderHtmlPage({ title, description, body }), 'utf8')
  console.log(`[knowledge] generated ${path.relative(root, outPath)}`)
}

function extractTitle(markdown) {
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/^#\s+(.+)\s*$/)
    if (match) return match[1].trim()
  }
  return ''
}

function renderHtmlPage({ title, description, body }) {
  const url = absoluteUrl('/knowledge/2html/')
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${escapeHtml(url)}">
  ${siteMeta({ title, description, url, type: 'article' })}
  <style>${courseCss()}</style>
  <style>${knowledgeCss()}</style>
</head>
<body class="knowledge-page">
  ${siteHeader()}
  ${body}
</body>
</html>
`
}

function renderToc(items) {
  if (!items?.length) return '<p class="toc-empty">无目录</p>'
  return `<nav class="toc" aria-label="目录导航">
${items
  .map((item) => {
    const indent = Math.max(0, (item.level || 2) - 2)
    const pad = 10 + indent * 14
    return `<a class="toc-link" style="padding-left:${pad}px" href="#${escapeHtml(item.id)}">${escapeHtml(
      item.text,
    )}</a>`
  })
  .join('\n')}
</nav>`
}

function normalizeMarkdownForStudy(markdown) {
  const lines = markdown.split(/\r?\n/)
  const out = []
  let inCode = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const fence = line.match(/^```/)
    if (fence) {
      inCode = !inCode
      out.push(line)
      continue
    }
    if (inCode) {
      out.push(line)
      continue
    }

    // Convert some repeated “提醒/注意/原则/易错点” paragraphs into collapsible blocks.
    if (/^>/.test(line)) {
      out.push(line)
      continue
    }

    const callout = line.match(/^(注意|提醒|易错点|原则|结论)[:：]\s*(.+)$/)
    if (callout) {
      const kind = callout[1]
      const rest = callout[2]
      out.push('')
      out.push(`:::know ${kind}`)
      out.push(rest)
      out.push(':::')
      out.push('')
      continue
    }

    out.push(line)
  }

  return out.join('\n')
}

function knowledgeCss() {
  return `
body.knowledge-page {
  overflow: hidden;
}
.knowledge-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(16rem, 19rem) minmax(0, 1fr);
  gap: 1.4rem;
  height: calc(100svh - var(--header-height));
  width: min(var(--wide), calc(100% - 2rem));
  margin: var(--header-height) auto 0;
  padding-top: 1.25rem;
}
.knowledge-rail {
  position: sticky;
  top: calc(var(--header-height) + 1.25rem);
  align-self: start;
  height: calc(100svh - var(--header-height) - 2.5rem);
  border: 1px solid var(--border);
  border-radius: 26px;
  background: var(--surface-glass);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 44px rgba(65, 49, 29, 0.08);
  overflow: auto;
}
.knowledge-rail-inner {
  min-height: 100%;
  padding: 1.15rem 1rem 1.35rem;
}
.rail-title {
  margin: 0 0 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.85rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
}
.toc {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.toc-link {
  display: block;
  padding: 0.28rem 0.5rem;
  border-radius: 10px;
  color: var(--muted);
  text-decoration: none;
  font-size: 0.92rem;
  line-height: 1.35;
}
.toc-link:hover {
  background: var(--accent-soft);
  color: var(--foreground);
}
.rail-tools {
  margin-top: 1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--border);
}
.rail-button {
  appearance: none;
  border: 1px solid var(--border);
  background: rgba(255, 255, 255, 0.7);
  color: var(--muted);
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  cursor: pointer;
  font-size: 0.85rem;
}
.rail-button:hover {
  color: var(--foreground);
  border-color: var(--border-strong);
}
.rail-link {
  display: inline-flex;
  align-items: center;
  border: 1px solid transparent;
  color: var(--muted);
  text-decoration: none;
  border-radius: 999px;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
}
.rail-link:hover {
  background: rgba(155, 106, 31, 0.1);
  color: var(--foreground);
}
.knowledge-main {
  width: 100%;
  height: 100%;
  overflow: auto;
  margin: 0;
  padding: 0 clamp(0.35rem, 1vw, 0.9rem) 6rem 0;
}
.knowledge-head {
  padding: 0.45rem 0 1.2rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.5rem;
}
.knowledge-kicker {
  margin: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-soft);
}
.knowledge-title {
  margin: 0.55rem 0 0.35rem;
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: clamp(1.65rem, 2.2vw, 2.25rem);
  line-height: 1.12;
}
.knowledge-desc {
  margin: 0;
  color: var(--muted);
  max-width: 70ch;
}
.knowledge-content h2,
.knowledge-content h3,
.knowledge-content h4 {
  scroll-margin-top: calc(var(--header-height) + 16px);
}
.knowledge-content details.know {
  margin: 0.9rem 0;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(255, 250, 242, 0.78);
}
.knowledge-content details.know > summary {
  cursor: pointer;
  list-style: none;
  padding: 0.7rem 0.9rem;
  font-weight: 650;
  color: var(--foreground);
}
.knowledge-content details.know > summary::-webkit-details-marker {
  display: none;
}
.knowledge-content details.know .know-body {
  padding: 0 0.9rem 0.85rem;
  color: var(--muted);
}
@media (max-width: 900px) {
  .knowledge-layout {
    grid-template-columns: 1fr;
    width: min(100% - 1.25rem, var(--wide));
    padding-top: 0.75rem;
  }
  .knowledge-rail {
    display: none;
  }
  body.knowledge-page {
    overflow: auto;
  }
}
`
}
