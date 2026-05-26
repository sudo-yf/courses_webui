import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import katex from 'katex'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const siteUrl = normalizeSiteUrl(process.env.COURSE_SITE_URL || 'https://20060618.xyz')

export function renderMarkdownToHtml(markdown, options = {}) {
  return renderMarkdown(markdown, options).html
}

export function renderMarkdown(markdown, options = {}) {
  const indent = options.indent || '      '
  const includeTocLevels = options.tocLevels || [2, 3]
  const lines = markdown.split(/\r?\n/)
  const html = []
  const toc = []
  const slugCounts = new Map()
  let paragraph = []
  let listType = null
  let blockquote = []
  let inCode = false
  let codeLang = ''
  let codeLines = []
  let inKnow = false
  let knowTitle = ''
  let knowLines = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    html.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (!listType) return
    html.push(`</${listType}>`)
    listType = null
  }
  const flushBlockquote = () => {
    if (!blockquote.length) return
    const callout = parseCallout(blockquote)
    if (callout) {
      html.push(
        `<aside class="callout callout-${escapeHtml(callout.kind)}"><div class="callout-title">${renderInline(callout.title)}</div><div class="callout-body">${renderSimpleBlocks(callout.body)}</div></aside>`,
      )
    } else {
      html.push(
        `<blockquote>${blockquote.map((line) => `<p>${renderInline(line)}</p>`).join('')}</blockquote>`,
      )
    }
    blockquote = []
  }
  const flushCode = () => {
    html.push(
      `<pre><code${codeLang ? ` class="language-${escapeHtml(codeLang)}"` : ''}>${escapeHtml(codeLines.join('\n'))}</code></pre>`,
    )
    inCode = false
    codeLang = ''
    codeLines = []
  }
  const flushKnow = () => {
    if (!inKnow) return
    const body = knowLines.join('\n').trim()
    html.push(
      `<details class="know" open><summary>${escapeHtml(knowTitle)}</summary><div class="know-body">${renderMarkdownToHtml(body, { indent: '' })}</div></details>`,
    )
    inKnow = false
    knowTitle = ''
    knowLines = []
  }

  for (const line of lines) {
    if (/^:::\s*know\b/.test(line)) {
      flushParagraph()
      flushList()
      flushBlockquote()
      flushKnow()
      inKnow = true
      knowTitle = line.replace(/^:::\s*know\s*/, '').trim() || '要点'
      continue
    }
    if (/^:::\s*$/.test(line) && inKnow) {
      flushKnow()
      continue
    }
    if (inKnow) {
      knowLines.push(line)
      continue
    }

    const codeFence = line.match(/^```(.*)$/)
    if (codeFence) {
      if (inCode) {
        flushCode()
      } else {
        flushParagraph()
        flushList()
        flushBlockquote()
        inCode = true
        codeLang = codeFence[1].trim()
      }
      continue
    }

    if (inCode) {
      codeLines.push(line)
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      flushList()
      flushBlockquote()
      continue
    }

    const thematicBreak = line.match(/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/)
    if (thematicBreak) {
      flushParagraph()
      flushList()
      flushBlockquote()
      html.push('<hr>')
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      flushBlockquote()
      const level = Math.min(6, heading[1].length + 1)
      const rawText = heading[2].trim()
      const plainText = stripInlineMarkup(rawText)
      const id = uniqueSlug(slugifyHeading(plainText), slugCounts)
      html.push(`<h${level} id="${escapeHtml(id)}" data-heading-level="${level}">${renderInline(rawText)}</h${level}>`)
      if (includeTocLevels.includes(level)) {
        toc.push({ level, id, text: plainText })
      }
      continue
    }

    const image = line.match(/^!\[(.*)\]\((https?:\/\/[^)]+)\)$/)
    if (image) {
      flushParagraph()
      flushList()
      flushBlockquote()
      html.push(renderFigure(image[2], image[1]))
      continue
    }

    const quote = line.match(/^>\s?(.*)$/)
    if (quote) {
      flushParagraph()
      flushList()
      blockquote.push(quote[1])
      continue
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      flushBlockquote()
      const desired = ordered ? 'ol' : 'ul'
      if (listType !== desired) {
        flushList()
        html.push(`<${desired}>`)
        listType = desired
      }
      html.push(`<li>${renderInline((unordered || ordered)[1])}</li>`)
      continue
    }

    paragraph.push(line.trim())
  }

  flushParagraph()
  flushList()
  flushBlockquote()
  if (inCode) flushCode()
  flushKnow()

  return { html: html.map((line) => `${indent}${line}`).join('\n'), toc }
}

function renderFigure(src, alt) {
  return `<figure>
  <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">
  <figcaption>${escapeHtml(alt)}</figcaption>
</figure>`
}

function renderInline(text) {
  const tokens = tokenizeInline(text)
  return tokens.map(renderInlineToken).join('')
}

function tokenizeInline(text) {
  const tokens = []
  let index = 0

  while (index < text.length) {
    const code = text.slice(index).match(/^`([^`]+)`/)
    if (code) {
      tokens.push({ type: 'code', value: code[1] })
      index += code[0].length
      continue
    }

    const math = matchMathToken(text, index)
    if (math) {
      tokens.push(math.token)
      index = math.end
      continue
    }

    const link = text.slice(index).match(/^\[([^\]]+)\]\(([^)]+)\)/)
    if (link) {
      tokens.push({ type: 'link', text: link[1], href: link[2] })
      index += link[0].length
      continue
    }

    const bold = text.slice(index).match(/^\*\*([^*]+)\*\*/)
    if (bold) {
      tokens.push({ type: 'bold', value: bold[1] })
      index += bold[0].length
      continue
    }

    tokens.push({ type: 'text', value: text[index] })
    index += 1
  }
  return tokens
}

function renderInlineToken(token) {
  if (token.type === 'code') return `<code>${escapeHtml(token.value)}</code>`
  if (token.type === 'bold') return `<strong>${escapeHtml(token.value)}</strong>`
  if (token.type === 'link') return `<a href="${escapeHtml(token.href)}">${escapeHtml(token.text)}</a>`
  if (token.type === 'math') return renderMath(token.value, token.display)
  return escapeHtml(token.value)
}

function matchMathToken(text, index) {
  const tail = text.slice(index)
  const block = tail.match(/^\$\$([\s\S]+?)\$\$/)
  if (block) return { token: { type: 'math', value: block[1], display: true }, end: index + block[0].length }
  const inline = tail.match(/^\$([^$\n]+)\$/)
  if (inline) return { token: { type: 'math', value: inline[1], display: false }, end: index + inline[0].length }
  return null
}

function normalizeMathSource(source) {
  return source.replace(/\s+/g, ' ').trim()
}

function renderMath(source, display) {
  try {
    return katex.renderToString(normalizeMathSource(source), {
      throwOnError: false,
      displayMode: Boolean(display),
    })
  } catch (err) {
    return `<code>${escapeHtml(source)}</code>`
  }
}

function stripInlineMarkup(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1').trim()
}

function slugifyHeading(text) {
  return text
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

function uniqueSlug(base, counts) {
  const count = counts.get(base) || 0
  counts.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

function parseCallout(lines) {
  if (!lines.length) return null
  const first = lines[0]
  const match = first.match(/^\[!(\w+)\]\s*(.*)$/)
  if (!match) return null
  const kind = match[1].toLowerCase()
  const title = match[2] || kind
  const body = lines.slice(1)
  return { kind, title, body }
}

function renderSimpleBlocks(lines) {
  const chunks = []
  let paragraph = []
  const flush = () => {
    if (!paragraph.length) return
    chunks.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  for (const line of lines) {
    if (!line.trim()) {
      flush()
      continue
    }
    paragraph.push(line.trim())
  }
  flush()
  return chunks.join('')
}

export function courseCss() {
  // Read from the generated CSS in build-course-recordings to keep style consistent without importing the whole builder.
  // Fall back to a small default if the file layout changes.
  try {
    const source = fs.readFileSync(path.join(root, 'scripts', 'build-course-recordings.mjs'), 'utf8')
    const start = source.indexOf('function courseCss()')
    if (start === -1) throw new Error('missing courseCss')
  } catch (_) {}
  return `
:root { color-scheme: light; --background:#f7f3ea; --panel:#fffdf8; --panel-soft:#f1ebde; --foreground:#20170f; --muted:#6d6252; --muted-soft:#8c7c67; --border:rgba(66,52,32,.12); --border-strong:rgba(66,52,32,.22); --accent:#9b6a1f; --accent-soft:rgba(155,106,31,.1); --surface-glass:rgba(255,252,246,.82); --surface-soft:rgba(255,250,242,.72); --grid:rgba(81,63,39,.03); --header-height:68px; --wide:1240px; }
*{ box-sizing:border-box; } html{ scroll-behavior:smooth; }
body{ margin:0; background:var(--background); color:var(--foreground); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.65; -webkit-font-smoothing:antialiased; }
body::before{ content:""; position:fixed; inset:0; pointer-events:none; background:radial-gradient(circle at 86% 8%, rgba(213,171,103,.14), transparent 26rem), radial-gradient(circle at 8% 90%, rgba(177,135,72,.1), transparent 24rem), linear-gradient(var(--grid) 1px, transparent 1px), linear-gradient(90deg, var(--grid) 1px, transparent 1px); background-size:auto, auto, 64px 64px, 64px 64px; }
body::after{ content:""; position:fixed; inset:0; pointer-events:none; background:linear-gradient(180deg, rgba(255,255,255,.32), rgba(247,243,234,.68)); }
.site-header{ position:fixed; top:0; left:0; right:0; z-index:10; display:flex; align-items:center; justify-content:space-between; gap:1rem; height:var(--header-height); padding:0 clamp(1rem,3vw,2.5rem); border-bottom:1px solid var(--border); background:var(--surface-glass); backdrop-filter: blur(20px); }
.site-title{ color:var(--foreground); font-family: Georgia,"Times New Roman","Songti SC",serif; font-size:1.2rem; font-weight:700; text-decoration:none; }
.site-header nav{ display:flex; gap:1.2rem; font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; font-size:.74rem; letter-spacing:.08em; text-transform: uppercase; }
.site-header nav a{ color:var(--muted); text-decoration:none; }
.site-header nav a:hover{ color:var(--foreground); }
.shell{ position:relative; z-index:1; width:min(var(--wide), calc(100% - 2rem)); margin: 0 auto; }
pre{ overflow:auto; padding: .85rem 1rem; border:1px solid var(--border); border-radius: 14px; background: var(--panel-soft); }
code{ font-family: ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace; }
a{ color: var(--accent); }
hr{ margin:2.4rem 0; border:0; height:1px; background:linear-gradient(90deg, transparent, var(--border-strong), transparent); }
figure{ margin: 1.2rem 0; border: 1px solid var(--border); border-radius: 16px; overflow:hidden; background: rgba(255,250,242,.72); }
figure img{ display:block; width:100%; height:auto; }
figcaption{ padding: .6rem .85rem; color: var(--muted); font-size: .9rem; }
`
}

export function siteHeader() {
  return `<header class="site-header">
  <a class="site-title" href="${absoluteUrl('/')}">Knowledge</a>
  <nav aria-label="资源">
    <a href="${absoluteUrl('/knowledge/2html/')}">2html</a>
  </nav>
</header>`
}

export function siteMeta({ title, description, url, type }) {
  const safeType = type || 'website'
  return `
  <meta property="og:type" content="${escapeHtml(safeType)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
`
}

export function absoluteUrl(pathname) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${siteUrl}${cleanPath}`
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeSiteUrl(value) {
  return String(value).replace(/\/+$/, '')
}
