import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import katex from 'katex'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sourceRoot = path.resolve(
  root,
  process.env.COURSE_SOURCE_ROOT ||
    path.join('..', 'sudo-yf.github.io', 'blog', '03-领域', '课程录音'),
)
const publicRoot = path.join(root, 'public')
const coursesRoot = path.join(publicRoot, 'courses')
const assetsRoot = path.join(publicRoot, 'course-assets')
const siteUrl = normalizeSiteUrl(
  process.env.COURSE_SITE_URL || 'https://20060618.xyz',
)

const subjectInfo = {
  互换: { slug: 'huhuan', title: '互换性与测量技术' },
  制图: { slug: 'zhitu', title: '工程制图' },
  大物: { slug: 'dawu', title: '大学物理Ⅲ(一)' },
  安化: { slug: 'anhua', title: '安全化学' },
  工材: { slug: 'gongcai', title: '工程材料' },
  法规: { slug: 'fagui', title: '安全法规' },
  热传: { slug: 'rechuan', title: '热量传递基础' },
  燃爆: { slug: 'ranbao', title: '燃烧与爆炸' },
}

const generatedAt = new Date().toISOString()

main()

function main() {
  const notes = discoverNotes()

  fs.rmSync(coursesRoot, { recursive: true, force: true })
  fs.rmSync(assetsRoot, { recursive: true, force: true })
  ensureDir(coursesRoot)
  ensureDir(assetsRoot)

  const pages = notes.map(buildPage)
  writeIndexes(pages)
  writeLlmsFiles(pages)
  writeCourseSitemap(pages)

  const imageRefs = pages.reduce((sum, page) => sum + page.imageCount, 0)
  console.log(
    `[course-recordings] generated ${pages.length} notes, ${imageRefs} image references`,
  )
}

function discoverNotes() {
  if (!fs.existsSync(sourceRoot)) {
    throw new Error(`missing course source root: ${sourceRoot}`)
  }

  const notes = []
  for (const subject of fs.readdirSync(sourceRoot).sort(localeSort)) {
    if (!subjectInfo[subject]) continue
    const subjectDir = path.join(sourceRoot, subject)
    if (!fs.statSync(subjectDir).isDirectory()) continue

    for (const fileName of fs.readdirSync(subjectDir).sort(localeSort)) {
      if (!fileName.endsWith('_with_ima.md')) continue
      if (fileName.includes('_with_ima_v')) continue

      const mmdd = fileName.replace(/_with_ima\.md$/, '')
      if (!/^\d{4}$/.test(mmdd)) continue

      const mdPath = path.join(subjectDir, fileName)
      const imagesJsonPath = path.join(subjectDir, `${mmdd}_with_ima.images.json`)
      notes.push({ subject, subjectDir, mmdd, mdPath, imagesJsonPath })
    }
  }

  if (notes.length !== 63) {
    throw new Error(`expected 63 formal *_with_ima.md files, found ${notes.length}`)
  }

  return notes.sort((a, b) => {
    const subjectDiff = localeSort(a.subject, b.subject)
    if (subjectDiff !== 0) return subjectDiff
    return a.mmdd.localeCompare(b.mmdd)
  })
}

function buildPage(note) {
  const raw = fs.readFileSync(note.mdPath, 'utf8')
  const { data, body } = parseFrontmatter(raw)
  const info = subjectInfo[note.subject]
  const date = normalizeDate(data.date, note.mmdd)
  const dateLabel = date || mmddLabel(note.mmdd)
  const title = `${info.title} ${dateLabel} 课堂笔记`
  const description = `${info.title} ${dateLabel} with_ima 课堂笔记，包含正文和可公开访问的课件图片。`
  const pagePath = `/courses/${info.slug}/${date || note.mmdd}/`
  const pageUrl = absoluteUrl(pagePath)
  const markdownUrl = absoluteUrl(`${pagePath}index.md`)
  const clearUrl = absoluteUrl(`${pagePath}clear.md`)
  const imageMeta = readImageMeta(note.imagesJsonPath)
  const imageMap = new Map(
    imageMeta.map((image) => [normalizeRelativePath(image.relative_path), image]),
  )
  const { markdown, images } = rewriteMarkdownImages(body, note, info, date, imageMap)
  const clear = readClearSource(note)
  const topic = extractFirstHeading(markdown)
  const htmlBody = renderMarkdownToHtml(markdown)
  const outputDir = path.join(coursesRoot, info.slug, date || note.mmdd)

  ensureDir(outputDir)
  fs.writeFileSync(
    path.join(outputDir, 'index.html'),
    renderHtmlPage({
      title,
      description,
      subject: info.title,
      date,
      pageUrl,
      markdownUrl,
      clearUrl,
      images,
      clear,
      body: htmlBody,
    }),
  )
  fs.writeFileSync(
    path.join(outputDir, 'index.md'),
    renderMarkdownPage({
      title,
      description,
      subject: info.title,
      date,
      sourcePath: path.relative(root, note.mdPath),
      clearSourcePath: clear.sourcePath,
      body: markdown,
    }),
  )
  if (clear.available) {
    fs.writeFileSync(
      path.join(outputDir, 'clear.md'),
      renderClearMarkdownPage({
        title,
        description,
        subject: info.title,
        date,
        sourcePath: clear.sourcePath,
        body: clear.markdown,
      }),
    )
  }

  return {
    subject: note.subject,
    subjectTitle: info.title,
    subjectSlug: info.slug,
    mmdd: note.mmdd,
    date,
    title,
    description,
    pagePath,
    pageUrl,
    markdownUrl,
    clearUrl: clear.available ? clearUrl : '',
    images,
    imageCount: images.length,
    clearAvailable: clear.available,
    topic,
  }
}

function readClearSource(note) {
  const candidates = [
    path.join(note.subjectDir, `${note.mmdd}-clear.md`),
    path.join(note.subjectDir, `${note.mmdd}-manual-cleaned.md`),
  ]
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate))
  if (!sourcePath) {
    return {
      available: false,
      sourcePath: '',
      sourceLabel: '',
      markdown: '',
      html: '',
    }
  }

  const raw = fs.readFileSync(sourcePath, 'utf8')
  const { body } = parseFrontmatter(raw)
  const markdown = body.trim()
  return {
    available: true,
    sourcePath: path.relative(root, sourcePath),
    sourceLabel: path.basename(sourcePath),
    markdown,
    html: renderMarkdownToHtml(markdown, { indent: '        ' }),
  }
}

function rewriteMarkdownImages(markdown, note, info, date, imageMap) {
  const copied = new Map()
  const images = []
  const dateSegment = date || note.mmdd

  const rewritten = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    if (/^https?:\/\//i.test(src)) return match

    const normalizedSrc = normalizeRelativePath(src)
    const sourcePath = path.resolve(note.subjectDir, normalizedSrc)
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`missing image: ${path.relative(root, sourcePath)}`)
    }

    const fileName = path.basename(normalizedSrc)
    const destRelPath = `/course-assets/${info.slug}/${dateSegment}/${fileName}`
    const destPath = path.join(publicRoot, destRelPath)
    ensureDir(path.dirname(destPath))

    if (!copied.has(destPath)) {
      fs.copyFileSync(sourcePath, destPath)
      copied.set(destPath, true)
    }

    const meta = imageMap.get(normalizedSrc) || {}
    const altText = buildAltText({
      originalAlt: alt,
      subjectTitle: info.title,
      date,
      mmdd: note.mmdd,
      meta,
    })
    const url = absoluteUrl(destRelPath)

    images.push({
      alt: altText,
      url,
      slideNo: meta.slide_no,
      caption: buildCaption(meta),
    })

    return `![${altText}](${url})`
  })

  return { markdown: rewritten, images }
}

function renderHtmlPage({
  title,
  description,
  subject,
  date,
  pageUrl,
  markdownUrl,
  clearUrl,
  images,
  clear,
  body,
}) {
  const imageUrls = images.slice(0, 12).map((image) => image.url)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LearningResource',
    headline: title,
    name: title,
    description,
    datePublished: date || undefined,
    dateModified: generatedAt,
    author: {
      '@type': 'Person',
      name: 'yifan',
    },
    about: subject,
    image: imageUrls,
    inLanguage: 'zh-CN',
    url: pageUrl,
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${pageUrl}">
  <link rel="alternate" type="text/markdown" href="${markdownUrl}">
  ${siteMeta({ title, description, url: pageUrl, type: 'article' })}
  ${mathAssets()}
  <style>${courseCss()}</style>
  <script type="application/ld+json">${escapeScriptJson(jsonLd)}</script>
</head>
<body class="note-page">
  ${siteHeader()}
  <main class="shell note-shell">
    <aside class="note-rail">
      <nav class="crumbs"><a href="${absoluteUrl('/courses/')}">课程</a><span>/</span><span>${escapeHtml(subject)}</span></nav>
      <p class="rail-label">科目</p>
      <p class="rail-value">${escapeHtml(subject)}</p>
      ${date ? `<p class="rail-label">日期</p><time class="rail-value" datetime="${date}">${date}</time>` : ''}
      <p class="rail-label">图片</p>
      <p class="rail-value">${images.length} 张</p>
      <p class="rail-label">Clear</p>
      <p class="rail-value">${clear.available ? '可查看' : '暂无'}</p>
      <p class="resource-links"><a href="${markdownUrl}">Markdown</a>${clear.available ? `<a href="${clearUrl}">Clear</a>` : ''}<a href="${absoluteUrl('/llms-full.txt')}">LLM</a></p>
    </aside>
    <article class="note">
      <header class="note-header">
        <p class="eyebrow">${escapeHtml(subject)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
      </header>
      ${renderClearPanel(clear)}
${body}
    </article>
  </main>
</body>
</html>
`
}

function renderMarkdownPage({ title, description, subject, date, sourcePath, clearSourcePath, body }) {
  return `---
title: ${yamlString(title)}
description: ${yamlString(description)}
date: ${date || ''}
subject: ${yamlString(subject)}
tags:
  - 课堂笔记
  - with_ima
authors:
  - yifan
source: ${yamlString(sourcePath)}
clear_source: ${yamlString(clearSourcePath || '')}
generated_at: ${generatedAt}
---

# ${title}

${description}

${body.trim()}
`
}

function renderClearMarkdownPage({ title, description, subject, date, sourcePath, body }) {
  return `---
title: ${yamlString(`${title} clear 原文`)}
description: ${yamlString(`${description} 对应的 clear 清洗稿原文。`)}
date: ${date || ''}
subject: ${yamlString(subject)}
tags:
  - 课堂笔记
  - clear
authors:
  - yifan
source: ${yamlString(sourcePath)}
generated_at: ${generatedAt}
---

# ${title} clear 原文

${body.trim()}
`
}

function renderClearPanel(clear) {
  if (!clear.available) {
    return `<aside class="clear-panel clear-panel-empty" aria-label="clear 原文">
        <p class="clear-empty">暂无对应 clear 原文。</p>
      </aside>`
  }

  return `<details class="clear-panel">
        <summary>
          <span>查看 clear 原文</span>
          <span>${escapeHtml(clear.sourceLabel)}</span>
        </summary>
        <div class="clear-content">
${clear.html}
        </div>
      </details>`
}

function writeIndexes(pages) {
  const bySubject = groupBy(pages, (page) => page.subjectSlug)

  writeIndexPage({
    dir: coursesRoot,
    title: '课程录音笔记',
    description: '按课程整理的课堂笔记、课件图和 Markdown 源文件。',
    body: renderSubjectCards(bySubject),
  })

  fs.writeFileSync(
    path.join(coursesRoot, 'index.md'),
    [
      '# Course Notes',
      '',
      '公开课程笔记索引，供网页 AI 直接读取。',
      '',
      ...Object.entries(bySubject).map(([subjectSlug, subjectPages]) => {
        const first = subjectPages[0]
        return `- [${first.subjectTitle}](${absoluteUrl(`/courses/${subjectSlug}/`)}) (${subjectPages.length})`
      }),
      '',
    ].join('\n'),
  )

  for (const [subjectSlug, subjectPages] of Object.entries(bySubject)) {
    const first = subjectPages[0]
    const dir = path.join(coursesRoot, subjectSlug)
    writeIndexPage({
      dir,
      title: first.subjectTitle,
      description: `${first.subjectTitle} with_ima 课堂笔记索引。`,
      body: renderPageCards(subjectPages),
    })
    fs.writeFileSync(
      path.join(dir, 'index.md'),
      [
        `# ${first.subjectTitle}`,
        '',
        `${first.subjectTitle} with_ima 课堂笔记索引。`,
        '',
        ...subjectPages.map(
          (page) =>
            `- [${page.title}](${page.pageUrl}) | [Markdown](${page.markdownUrl}) | images: ${page.imageCount}`,
        ),
        '',
      ].join('\n'),
    )
  }
}

function writeIndexPage({ dir, title, description, body }) {
  ensureDir(dir)
  const url = absoluteUrl(`/${path.relative(publicRoot, dir).replaceAll(path.sep, '/')}/`)
  fs.writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="canonical" href="${url}">
  ${siteMeta({ title, description, url, type: 'website' })}
  ${mathAssets()}
  <style>${courseCss()}</style>
</head>
<body class="index-page">
  ${siteHeader()}
  <main class="shell index-shell">
    <aside class="hero-panel">
      <p class="eyebrow">Course archive</p>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(description)}</p>
      <p class="resource-links"><a href="${absoluteUrl('/courses/index.md')}">Markdown</a><a href="${absoluteUrl('/llms-full.txt')}">LLM</a></p>
    </aside>
    <section class="index">
      <header class="index-header">
        <p>${escapeHtml(description)}</p>
      </header>
${body}
    </section>
  </main>
</body>
</html>
`,
  )
}

function siteHeader() {
  return `<header class="site-header">
  <a class="site-title" href="${absoluteUrl('/courses/')}">Course Notes</a>
  <nav aria-label="课程资源">
    <a href="${absoluteUrl('/courses/')}">课程</a>
    <a href="${absoluteUrl('/courses/index.md')}">Markdown</a>
    <a href="${absoluteUrl('/llms-full.txt')}">LLM</a>
  </nav>
</header>`
}

function mathAssets() {
  return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css">`
}

function siteMeta({ title, description, url, type }) {
  const ogImage = absoluteUrl('/web-app-manifest-512x512.png')
  return `
  <link rel="icon" href="${absoluteUrl('/favicon.ico')}">
  <link rel="icon" type="image/svg+xml" href="${absoluteUrl('/favicon.svg')}">
  <link rel="apple-touch-icon" href="${absoluteUrl('/apple-touch-icon.png')}">
  <link rel="manifest" href="${absoluteUrl('/site.webmanifest')}">
  <meta name="theme-color" content="#080806">
  <meta property="og:type" content="${escapeHtml(type)}">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(url)}">
  <meta property="og:image" content="${escapeHtml(ogImage)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(description)}">
  <meta name="twitter:image" content="${escapeHtml(ogImage)}">
`
}

function renderSubjectCards(bySubject) {
  const subjects = Object.entries(bySubject)
  const totalNotes = subjects.reduce((sum, [, pages]) => sum + pages.length, 0)
  const totalImages = subjects.reduce(
    (sum, [, pages]) => sum + pages.reduce((inner, page) => inner + page.imageCount, 0),
    0,
  )
  return `<section class="summary-line" aria-label="课程统计">
  <span><strong>${subjects.length}</strong> 门课程</span>
  <span><strong>${totalNotes}</strong> 次课</span>
  <span><strong>${totalImages}</strong> 张图</span>
</section>
<section class="archive-list" aria-label="课程列表">
${subjects
  .map(([subjectSlug, subjectPages], index) => {
    const first = subjectPages[0]
    const imageCount = subjectPages.reduce((sum, page) => sum + page.imageCount, 0)
    const completeCount = subjectPages.filter((page) => page.imageCount > 0).length
    return `<article class="archive-item subject-card">
  <span class="archive-number">${String(index + 1).padStart(2, '0')}</span>
  <div>
    <a class="archive-title" href="${absoluteUrl(`/courses/${subjectSlug}/`)}">${escapeHtml(first.subjectTitle)}</a>
    <p>${subjectPages.length} 次课 / ${completeCount} 次有图 / ${imageCount} 张图</p>
  </div>
  <span class="archive-code">${escapeHtml(subjectSlug)}</span>
</article>`
  })
  .join('\n')}
</section>`
}

function renderPageCards(pages) {
  const imageTotal = pages.reduce((sum, page) => sum + page.imageCount, 0)
  const imagePages = pages.filter((page) => page.imageCount > 0).length
  return `<section class="summary-line" aria-label="课次统计">
  <span><strong>${pages.length}</strong> 次课</span>
  <span><strong>${imagePages}</strong> 次有图</span>
  <span><strong>${imageTotal}</strong> 张图</span>
</section>
<section class="archive-list note-list" aria-label="课次列表">
${pages
  .map((page, index) => {
    return `<article class="archive-item note-item">
  <span class="archive-number">${String(index + 1).padStart(2, '0')}</span>
  <div>
    <a class="archive-title" href="${page.pageUrl}">${escapeHtml(page.date || page.mmdd)}</a>
    <p>${escapeHtml(page.topic || '课堂笔记')} / ${page.imageCount} 张图</p>
    <p class="resource-links"><a href="${page.pageUrl}">HTML</a><a href="${page.markdownUrl}">Markdown</a>${page.clearUrl ? `<a href="${page.clearUrl}">Clear</a>` : ''}</p>
  </div>
  <span class="archive-code">${escapeHtml(page.subjectSlug)}</span>
</article>`
  })
  .join('\n')}
</section>`
}

function extractFirstHeading(markdown) {
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{2,6}\s+(.+)$/)
    if (heading) return heading[1].replace(/\*\*/g, '').trim()
  }
  return ''
}

function writeLlmsFiles(pages) {
  const bySubject = groupBy(pages, (page) => page.subjectSlug)
  fs.writeFileSync(
    path.join(publicRoot, 'llms.txt'),
    [
      '# Yifan Course Notes',
      '',
      'These pages are static course notes with direct Markdown mirrors and public image URLs.',
      '',
      '## Entrypoints',
      `- Course notes index: ${absoluteUrl('/courses/')}`,
      `- Markdown index: ${absoluteUrl('/courses/index.md')}`,
      `- Full machine-readable list: ${absoluteUrl('/llms-full.txt')}`,
      `- Course sitemap: ${absoluteUrl('/course-sitemap.xml')}`,
      '',
      '## Subjects',
      ...Object.entries(bySubject).map(([subjectSlug, subjectPages]) => {
        const first = subjectPages[0]
        return `- ${first.subjectTitle}: ${absoluteUrl(`/courses/${subjectSlug}/`)}`
      }),
      '',
    ].join('\n'),
  )

  fs.writeFileSync(
    path.join(publicRoot, 'llms-full.txt'),
    [
      '# Yifan Course Notes Full Index',
      '',
      `Generated at: ${generatedAt}`,
      '',
      ...pages.map(
        (page) =>
          `- ${page.title}\n  HTML: ${page.pageUrl}\n  Markdown: ${page.markdownUrl}\n  Images: ${page.imageCount}`,
      ),
      '',
    ].join('\n'),
  )
}

function writeCourseSitemap(pages) {
  const urls = [
    absoluteUrl('/courses/'),
    ...unique(pages.map((page) => absoluteUrl(`/courses/${page.subjectSlug}/`))),
    ...pages.map((page) => page.pageUrl),
    ...pages.map((page) => page.markdownUrl),
  ]
  fs.writeFileSync(
    path.join(publicRoot, 'course-sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeHtml(url)}</loc>
    <lastmod>${generatedAt.slice(0, 10)}</lastmod>
  </url>`,
  )
  .join('\n')}
</urlset>
`,
  )
}

function renderMarkdownToHtml(markdown, options = {}) {
  const indent = options.indent || '      '
  const lines = markdown.split(/\r?\n/)
  const html = []
  let paragraph = []
  let listType = null
  let blockquote = []
  let inCode = false
  let codeLang = ''
  let codeLines = []

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

  for (const line of lines) {
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

    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      flushParagraph()
      flushList()
      flushBlockquote()
      const level = Math.min(6, heading[1].length + 1)
      html.push(`<h${level}>${renderInline(heading[2].trim())}</h${level}>`)
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

  return html.map((line) => `${indent}${line}`).join('\n')
}

function renderFigure(src, alt) {
  return `<figure>
  <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">
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

    const nextSpecial = findNextInlineSpecial(text, index + 1)
    tokens.push({ type: 'text', value: text.slice(index, nextSpecial) })
    index = nextSpecial
  }

  return tokens
}

function matchMathToken(text, start) {
  const pairs = [
    { left: '$$', right: '$$', display: true },
    { left: '\\[', right: '\\]', display: true },
    { left: '\\(', right: '\\)', display: false },
    { left: '$', right: '$', display: false },
  ]

  for (const pair of pairs) {
    if (!text.startsWith(pair.left, start)) continue
    if (pair.left === '$' && text[start + 1] === '$') continue

    const contentStart = start + pair.left.length
    const end = text.indexOf(pair.right, contentStart)
    if (end === -1) return null

    const content = text.slice(contentStart, end)
    if (!content.trim()) return null
    if (pair.left === '$' && /^\s|\s$/.test(content)) return null

    return {
      token: { type: 'math', value: content, display: pair.display },
      end: end + pair.right.length,
    }
  }

  return null
}

function findNextInlineSpecial(text, from) {
  const candidates = ['`', '$', '\\(', '\\[']
    .map((needle) => text.indexOf(needle, from))
    .filter((position) => position !== -1)
  return candidates.length ? Math.min(...candidates) : text.length
}

function renderInlineToken(token) {
  if (token.type === 'code') return `<code>${escapeHtml(token.value)}</code>`
  if (token.type === 'math') return renderMath(token.value, token.display)
  return renderMarkdownText(token.value)
}

function renderMarkdownText(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
}

function renderMath(source, displayMode) {
  return katex.renderToString(normalizeMathSource(source), {
    displayMode,
    throwOnError: false,
    strict: 'ignore',
    trust: false,
  })
}

function normalizeMathSource(source) {
  return source
    .replace(/\\text\{([^{}]*·[^{}]*)\}/g, (_, textContent) =>
      textContent
        .split('·')
        .map((part) => `\\mathrm{${part}}`)
        .join('\\cdot '),
    )
    .replaceAll('·', '\\cdot ')
}

function parseCallout(lines) {
  const marker = lines[0]?.match(/^\[!([A-Za-z0-9_-]+)\][-+]?\s*(.*)$/)
  if (!marker) return null

  const kind = marker[1].toLowerCase()
  const customTitle = marker[2].trim()
  return {
    kind,
    title: customTitle || calloutTitle(kind),
    body: lines.slice(1),
  }
}

function calloutTitle(kind) {
  return (
    {
      abstract: '摘要',
      bug: '问题',
      danger: '危险',
      definition: '定义',
      example: '例',
      failure: '失败',
      important: '重要',
      info: '信息',
      note: '笔记',
      question: '问题',
      quote: '引用',
      success: '成功',
      summary: '总结',
      tip: '提示',
      todo: '待办',
      warning: '注意',
    }[kind] || kind
  )
}

function renderSimpleBlocks(lines) {
  const blocks = []
  let current = []
  for (const line of lines) {
    if (!line.trim()) {
      if (current.length) {
        blocks.push(`<p>${renderInline(current.join(' '))}</p>`)
        current = []
      }
      continue
    }
    current.push(line.trim())
  }
  if (current.length) blocks.push(`<p>${renderInline(current.join(' '))}</p>`)
  return blocks.join('') || '<p></p>'
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return { data: {}, body: raw }
  const end = raw.indexOf('\n---', 4)
  if (end === -1) return { data: {}, body: raw }
  const frontmatter = raw.slice(4, end).trim()
  const body = raw.slice(raw.indexOf('\n', end + 4) + 1)
  const data = {}

  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!match) continue
    data[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }

  return { data, body }
}

function readImageMeta(jsonPath) {
  if (!fs.existsSync(jsonPath)) return []
  const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  return Array.isArray(parsed.images) ? parsed.images : []
}

function normalizeDate(value, mmdd) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const month = mmdd.slice(0, 2)
  const day = mmdd.slice(2)
  return `2026-${month}-${day}`
}

function mmddLabel(mmdd) {
  return `${mmdd.slice(0, 2)}-${mmdd.slice(2)}`
}

function buildAltText({ originalAlt, subjectTitle, date, mmdd, meta }) {
  const slide = meta.slide_no || originalAlt.replace(/^slide\s*/i, '').trim()
  const base = `${subjectTitle} ${date || mmdd} slide ${slide || ''}`.trim()
  const detail = (meta.reason || meta.selection_text || '').replace(/\s+/g, ' ').trim()
  if (!detail) return base
  return `${base}: ${truncate(detail, 90)}`
}

function buildCaption(meta) {
  const parts = []
  if (meta.slide_no) parts.push(`slide ${meta.slide_no}`)
  if (meta.reason) parts.push(meta.reason)
  return parts.join(': ')
}

function truncate(text, maxLength) {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`
}

function normalizeRelativePath(value) {
  return decodeURI(value).replace(/^\.?\//, '').replaceAll('\\', '/')
}

function normalizeSiteUrl(value) {
  return value.replace(/\/+$/, '')
}

function absoluteUrl(pathname) {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${siteUrl}${cleanPath}`
}

function yamlString(value) {
  return JSON.stringify(String(value))
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeScriptJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function groupBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item)
    ;(acc[key] ??= []).push(item)
    return acc
  }, {})
}

function unique(items) {
  return [...new Set(items)]
}

function localeSort(a, b) {
  return a.localeCompare(b, 'zh-CN')
}

function courseCss() {
  return `
:root {
  color-scheme: dark;
  --background: #080806;
  --panel: #10100d;
  --panel-soft: #16150f;
  --foreground: #f5f1e7;
  --muted: #a49d8c;
  --muted-soft: #766f62;
  --border: rgba(245, 241, 231, 0.14);
  --border-strong: rgba(245, 241, 231, 0.28);
  --accent: #d9b46f;
  --accent-soft: rgba(217, 180, 111, 0.12);
  --danger: #d07362;
  --reader: 820px;
  --wide: 1240px;
  --header-height: 68px;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.65;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 85% 8%, rgba(217, 180, 111, 0.16), transparent 24rem),
    radial-gradient(circle at 8% 88%, rgba(114, 86, 44, 0.18), transparent 24rem),
    linear-gradient(rgba(245, 241, 231, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(245, 241, 231, 0.035) 1px, transparent 1px);
  background-size: auto, auto, 36px 36px, 36px 36px;
}
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(8, 8, 6, 0.18), rgba(8, 8, 6, 0.82));
}
.site-header {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  height: var(--header-height);
  padding: 0 clamp(1rem, 3vw, 2.5rem);
  border-bottom: 1px solid var(--border);
  background: rgba(8, 8, 6, 0.72);
  backdrop-filter: blur(20px);
}
.site-title {
  color: var(--foreground);
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: 1.2rem;
  font-weight: 700;
  text-decoration: none;
}
.site-header nav {
  display: flex;
  gap: 1.2rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.site-header nav a,
.resource-links a,
.crumbs a {
  color: var(--muted);
  text-decoration: none;
}
.site-header nav a:hover,
.resource-links a:hover,
.crumbs a:hover {
  color: var(--foreground);
}
.shell {
  position: relative;
  z-index: 1;
  width: min(var(--wide), calc(100% - 2rem));
  margin: 0 auto;
  padding: calc(var(--header-height) + 4.5rem) 0 7rem;
}
.index-shell,
.note-shell {
  display: grid;
  grid-template-columns: minmax(16rem, 25rem) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: start;
}
.note {
  width: min(var(--reader), 100%);
  min-width: 0;
}
.index {
  width: 100%;
  min-width: 0;
}
.hero-panel,
.note-rail {
  position: sticky;
  top: calc(var(--header-height) + 2rem);
}
.hero-panel {
  min-height: calc(100svh - var(--header-height) - 7rem);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-right: 1.5rem;
  border-right: 1px solid var(--border);
}
.note-rail {
  display: grid;
  gap: 0.2rem;
  padding-right: 1.5rem;
  border-right: 1px solid var(--border);
}
.crumbs,
.eyebrow,
time,
.rail-label {
  color: var(--muted-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.crumbs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin: 0 0 2.5rem;
}
.eyebrow {
  margin: 0 0 0.75rem;
  font-weight: 720;
}
.rail-label {
  margin: 1.4rem 0 0.2rem;
}
.rail-value {
  margin: 0;
  color: var(--foreground);
  font-size: 1.05rem;
}
.note-rail time {
  color: var(--foreground);
  font-size: 1.05rem;
  letter-spacing: 0;
  text-transform: none;
}
.note-header,
.index-header {
  margin-bottom: 2.8rem;
  padding-bottom: 1.6rem;
  border-bottom: 1px solid var(--border);
}
.index-header {
  display: none;
}
h1, h2, h3, h4, h5, h6 {
  line-height: 1.22;
  font-weight: 720;
  letter-spacing: 0;
}
h1 {
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: clamp(4rem, 10vw, 8.8rem);
  margin: 0.2rem 0 1.4rem;
  max-width: 8ch;
  line-height: 0.88;
  letter-spacing: -0.07em;
}
.note-header h1 {
  font-size: clamp(2.6rem, 5vw, 5.4rem);
  max-width: 13ch;
  line-height: 0.92;
}
.index-header p,
.note-header p,
.hero-panel p {
  max-width: 48rem;
  color: var(--muted);
  font-size: 1.05rem;
}
h2 {
  margin: 4rem 0 1.1rem;
  padding-top: 1.2rem;
  border-top: 1px solid var(--border);
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: 2rem;
}
h3 { font-size: 1.35rem; margin-top: 2.2rem; }
h4, h5, h6 { font-size: 1.1rem; margin-top: 1.5rem; }
a {
  color: var(--accent);
  text-decoration-thickness: 0.06em;
  text-underline-offset: 0.18em;
}
.note > p,
.note > ul,
.note > ol,
.note > blockquote,
.note > .callout {
  font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;
  font-size: 1.14rem;
}
.note > p,
.note > ul,
.note > ol {
  color: color-mix(in oklab, var(--foreground) 90%, var(--muted));
}
.resource-links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-top: 1.4rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.resource-links a {
  padding-bottom: 0.1rem;
  border-bottom: 1px solid var(--border-strong);
}
img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--border);
  background: #f8f5ec;
}
figure {
  margin: 2rem 0 2.6rem;
}
figcaption {
  margin-top: 0.65rem;
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.76rem;
}
blockquote {
  margin: 1.5rem 0;
  padding: 0.2rem 1rem;
  border-left: 3px solid var(--accent);
  color: var(--muted);
}
.callout {
  margin: 1.5rem 0;
  padding: 0.25rem 0 0.25rem 1rem;
  border-left: 3px solid var(--callout-color, var(--accent));
}
.callout-title {
  margin-bottom: 0.35rem;
  color: var(--callout-color, var(--accent));
  font-weight: 700;
}
.callout-body p { margin: 0.4rem 0 0; }
.callout-example { --callout-color: #b45309; }
.callout-warning,
.callout-danger,
.callout-failure { --callout-color: #b91c1c; }
.callout-definition,
.callout-note,
.callout-info { --callout-color: #0f766e; }
.callout-tip,
.callout-success { --callout-color: #15803d; }
pre {
  overflow-x: auto;
  padding: 1rem;
  border: 1px solid var(--border);
  background: #11110f;
  color: var(--foreground);
}
code { font-family: "JetBrains Mono", monospace; }
.clear-panel {
  margin: 0 0 2.8rem;
  border-top: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(245, 241, 231, 0.035), rgba(245, 241, 231, 0.01));
}
.clear-panel summary {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 0;
  color: var(--foreground);
  cursor: pointer;
  list-style: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.clear-panel summary::-webkit-details-marker {
  display: none;
}
.clear-panel summary::before {
  content: "+";
  color: var(--accent);
}
.clear-panel[open] summary::before {
  content: "−";
}
.clear-panel summary span:first-child {
  margin-right: auto;
}
.clear-panel summary span:last-child,
.clear-empty {
  color: var(--muted);
}
.clear-content {
  max-height: min(72vh, 52rem);
  overflow: auto;
  padding: 0 0 1.4rem 1.05rem;
  border-left: 1px solid var(--border);
}
.clear-content h2,
.clear-content h3,
.clear-content h4 {
  margin: 1.6rem 0 0.75rem;
  padding: 0;
  border: 0;
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1rem;
  letter-spacing: 0;
}
.clear-content p,
.clear-content li,
.clear-content blockquote {
  color: color-mix(in oklab, var(--foreground) 78%, var(--muted));
  font-family: Georgia, "Songti SC", "Noto Serif CJK SC", serif;
  font-size: 1rem;
  line-height: 1.82;
}
.clear-content p {
  margin: 0.85rem 0;
}
.clear-panel-empty {
  padding: 1rem 0;
}
.clear-empty {
  margin: 0;
  font-size: 0.92rem;
}
.summary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 0.8rem 1.4rem;
  margin: 0 0 1.6rem;
  padding-bottom: 1.2rem;
  border-bottom: 1px solid var(--border);
  color: var(--muted);
}
.summary-line strong {
  color: var(--foreground);
  font-family: Georgia, "Times New Roman", serif;
  font-size: 1.6rem;
  font-weight: 700;
}
.archive-list {
  display: grid;
  border-top: 1px solid var(--border);
}
.archive-item {
  display: grid;
  grid-template-columns: 4.5rem minmax(0, 1fr) auto;
  gap: 1.2rem;
  align-items: start;
  min-height: 8.5rem;
  padding: 1.45rem 0;
  border-bottom: 1px solid var(--border);
}
.archive-title {
  color: var(--foreground);
  font-family: Georgia, "Times New Roman", "Songti SC", serif;
  font-size: clamp(1.55rem, 3vw, 2.4rem);
  font-weight: 720;
  text-decoration: none;
  line-height: 1;
}
.archive-title:hover {
  color: var(--accent);
}
.archive-item p {
  margin: 0.55rem 0 0;
  color: var(--muted);
}
.archive-number,
.archive-code {
  color: var(--muted-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.8rem;
}
.archive-code {
  text-transform: uppercase;
}
@media (max-width: 900px) {
  .index-shell,
  .note-shell {
    grid-template-columns: 1fr;
  }
  .hero-panel,
  .note-rail {
    position: static;
    min-height: 0;
    padding-right: 0;
    padding-bottom: 1.8rem;
    border-right: 0;
    border-bottom: 1px solid var(--border);
  }
  h1 {
    max-width: 10ch;
  }
}
@media (max-width: 640px) {
  .site-header {
    height: auto;
    min-height: var(--header-height);
    align-items: center;
    padding: 0 1rem;
  }
  .site-header nav {
    gap: 0.8rem;
    font-size: 0.68rem;
  }
  .shell {
    width: min(100% - 1.25rem, var(--wide));
    padding: calc(var(--header-height) + 2.2rem) 0 5rem;
  }
  h1 {
    font-size: clamp(3.2rem, 17vw, 5rem);
  }
  .note-header h1 {
    font-size: clamp(2.7rem, 14vw, 4.4rem);
  }
  .clear-panel summary {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.35rem;
  }
  .clear-panel summary::before {
    position: absolute;
    right: 0;
  }
  .clear-content {
    max-height: 68vh;
    padding-left: 0.85rem;
  }
  .archive-item {
    grid-template-columns: 2.8rem minmax(0, 1fr);
  }
  .archive-code {
    display: none;
  }
}
`
}
