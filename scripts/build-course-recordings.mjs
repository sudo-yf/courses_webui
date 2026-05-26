import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import katex from 'katex'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sourceRoot =
  process.env.COURSE_SOURCE_ROOT || discoverCourseSourceRoot()
const examRoot =
  process.env.COURSE_EXAM_ROOT || discoverExamRoot()
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
  安原: { slug: 'anyuan', title: '安全学原理' },
  工材: { slug: 'gongcai', title: '工程材料' },
  法规: { slug: 'fagui', title: '安全法规' },
  热传: { slug: 'rechuan', title: '热量传递基础' },
  燃爆: { slug: 'ranbao', title: '燃烧与爆炸' },
}

const generatedAt = new Date().toISOString()

main()

function main() {
  const notes = discoverNotes()
  const examBySubjectSlug = readExamSchedule()

  fs.rmSync(coursesRoot, { recursive: true, force: true })
  fs.rmSync(assetsRoot, { recursive: true, force: true })
  ensureDir(coursesRoot)
  ensureDir(assetsRoot)

  const pages = notes.map(buildPage)
  const bySubjectSlug = groupBy(pages, (page) => page.subjectSlug)
  const noteNavByPageUrl = buildNoteNavByPageUrl(bySubjectSlug)
  for (const page of pages) {
    const outputDir = path.join(coursesRoot, page.subjectSlug, page.date || page.mmdd)
    if (!fs.existsSync(path.join(outputDir, 'index.html'))) continue
    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8')
    const injected = html.replace(
      '__NOTE_NAV__',
      noteNavByPageUrl.get(page.pageUrl) || '',
    )
    if (injected !== html) fs.writeFileSync(path.join(outputDir, 'index.html'), injected)
  }
  writeIndexes(pages, examBySubjectSlug)
  writeLlmsFiles(pages)
  writeCourseSitemap(pages)

  const imageRefs = pages.reduce((sum, page) => sum + page.imageCount, 0)
  console.log(
    `[course-recordings] generated ${pages.length} notes, ${imageRefs} image references`,
  )
}

function discoverCourseSourceRoot() {
  const candidates = [
    '/Users/a123/sudo-yf.github.io/blog/03-领域/课程录音',
    path.resolve(root, '..', 'sudo-yf.github.io', 'blog', '03-领域', '课程录音'),
    path.resolve(root, '..', '..', '03-领域', '课程录音'),
    path.resolve(root, '..', '..', '..', '03-领域', '课程录音'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return path.resolve(root, '..', 'sudo-yf.github.io', 'blog', '03-领域', '课程录音')
}

function discoverExamRoot() {
  const candidates = [
    '/Users/a123/sudo-yf.github.io/blog/00-总览/考试 DDL数据',
    path.resolve(root, '..', 'sudo-yf.github.io', 'blog', '00-总览', '考试 DDL数据'),
    path.resolve(root, '..', '..', '00-总览', '考试 DDL数据'),
    path.resolve(root, '..', '..', '..', '00-总览', '考试 DDL数据'),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  return path.resolve(root, '..', 'sudo-yf.github.io', 'blog', '00-总览', '考试 DDL数据')
}

function readExamSchedule() {
  const schedule = new Map()
  if (!fs.existsSync(examRoot)) return schedule

  const examFiles = [
    { slug: 'ranbao', fileName: '04-燃烧与爆炸理论.md' },
    { slug: 'huhuan', fileName: '07-互换性与技术测量.md' },
    { slug: 'rechuan', fileName: '03-工程热力学与传热学基础.md' },
    { slug: 'fagui', fileName: '05-安全应急法规与标准.md' },
    { slug: 'anhua', fileName: '06-安全工程化学基础.md' },
    { slug: 'gongcai', fileName: '02-工程材料及金属工艺学.md' },
    { slug: 'dawu', fileName: '01-大学物理Ⅲ(一).md' },
  ]

  for (const { slug, fileName } of examFiles) {
    const filePath = path.join(examRoot, fileName)
    if (!fs.existsSync(filePath)) continue
    const raw = fs.readFileSync(filePath, 'utf8')
    const { data } = parseFrontmatter(raw)
    if (!data.exam_time) continue
    const start = parseExamDateTime(data.exam_time)
    if (!start) continue
    const end = parseExamDateTime(data.exam_end)
    const credits = data.credits ? Number(data.credits) : null
    schedule.set(slug, {
      course: data.course || '',
      start,
      end,
      credits: Number.isFinite(credits) ? credits : null,
    })
  }

  return schedule
}

function parseExamDateTime(value) {
  if (!value) return null
  const normalized = String(value).trim()
  if (!/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(normalized)) return null
  const asDate = new Date(normalized.replace(' ', 'T') + ':00')
  if (Number.isNaN(asDate.getTime())) return null
  return asDate
}

function daysUntil(target) {
  const now = new Date()
  const ms = target.getTime() - now.getTime()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

function renderDaysUntilLabel(examStart) {
  const now = new Date()
  const ms = examStart.getTime() - now.getTime()
  if (ms < 0) return `已考试`
  const days = ms / (24 * 60 * 60 * 1000)
  const rounded = Math.round(days * 10) / 10
  if (rounded === 0) return `今天考试`
  return `${rounded} 天`
}

function renderRemainingDaysEnglish(examStart) {
  if (!examStart) return ''
  const now = new Date()
  const ms = examStart.getTime() - now.getTime()
  if (ms < 0) return 'Done'
  const days = ms / (24 * 60 * 60 * 1000)
  const rounded = Math.round(days * 10) / 10
  return `${rounded} Days`
}

function formatExamTimeDisplay(examStart, examEnd) {
  if (!examStart) return '待确认'
  const month = String(examStart.getMonth() + 1).padStart(2, '0')
  const day = String(examStart.getDate()).padStart(2, '0')
  const hour = String(examStart.getHours()).padStart(2, '0')
  const minute = String(examStart.getMinutes()).padStart(2, '0')
  const year = examStart.getFullYear()
  const startLabel = `${year}-${month}-${day} ${hour}:${minute}`
  if (!examEnd) return startLabel
  const endHour = String(examEnd.getHours()).padStart(2, '0')
  const endMinute = String(examEnd.getMinutes()).padStart(2, '0')
  return `${startLabel}-${endHour}:${endMinute}`
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

  const summaryNotePath = path.join(sourceRoot, '燃爆', '燃爆复习总纲.md')
  if (fs.existsSync(summaryNotePath)) {
    notes.push({
      subject: '燃爆',
      subjectDir: path.join(sourceRoot, '燃爆'),
      mmdd: '9999',
      mdPath: summaryNotePath,
      imagesJsonPath: '',
      summarySlug: 'revi',
    })
  }

  if (notes.length === 0) {
    throw new Error(`expected *_with_ima.md files, found 0 under ${sourceRoot}`)
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
  const summaryMode = note.mmdd === '9999'
  const date = summaryMode ? '' : normalizeDate(data.date, note.mmdd)
  const dateLabel = summaryMode ? '复习总纲' : date || mmddLabel(note.mmdd)
  const title = `${info.title} ${dateLabel} 课堂笔记`
  const description = `${info.title} ${dateLabel} with_ima 课堂笔记，包含正文和可公开访问的课件图片。`
  const pagePath = summaryMode
    ? `/courses/${info.slug}/review-outline/`
    : `/courses/${info.slug}/${date || note.mmdd}/`
  const pageUrl = absoluteUrl(pagePath)
  const markdownUrl = absoluteUrl(`${pagePath}index.md`)
  const clearUrl = absoluteUrl(`${pagePath}clear.md`)
  const imageMeta = summaryMode ? [] : readImageMeta(note.imagesJsonPath)
  const imageMap = new Map(
    imageMeta.map((image) => [normalizeRelativePath(image.relative_path), image]),
  )
  const { markdown, images } = rewriteMarkdownImages(body, note, info, date, imageMap)
  const clear = summaryMode ? emptyClearSource() : readClearSource(note)
  const topic = extractFirstHeading(markdown)
  const rendered = renderMarkdown(markdown, { tocLevels: [2, 3, 4] })
  const htmlBody = rendered.html
  const toc = rendered.toc
  const noteNav = '__NOTE_NAV__'
  renderFigure.loadingIndex = 0
  const outputDir = path.join(
    coursesRoot,
    info.slug,
    summaryMode ? 'review-outline' : date || note.mmdd,
  )

  ensureDir(outputDir)
  fs.writeFileSync(
    path.join(outputDir, 'index.html'),
    renderHtmlPage({
      title,
      description,
      subject: info.title,
      subjectSlug: info.slug,
      date,
      pageUrl,
      markdownUrl,
      clearUrl,
      images,
      clear,
      toc,
      noteNav,
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
    mmdd: summaryMode ? 'review-outline' : note.mmdd,
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

function emptyClearSource() {
  return {
    available: false,
    sourcePath: '',
    sourceLabel: '',
    markdown: '',
    html: '',
    toc: [],
  }
}

function readClearSource(note) {
  const candidates = [
    path.join(note.subjectDir, `${note.mmdd}-clear.md`),
    path.join(note.subjectDir, `${note.mmdd}-manual-cleaned.md`),
    path.join(note.subjectDir, `${note.mmdd}-note.clean.md`),
  ]
  const sourcePath = candidates.find((candidate) => fs.existsSync(candidate))
  if (!sourcePath) {
    return {
      available: false,
      sourcePath: '',
      sourceLabel: '',
      markdown: '',
      html: '',
      toc: [],
    }
  }

  const raw = fs.readFileSync(sourcePath, 'utf8')
  const { body } = parseFrontmatter(raw)
  const markdown = body.trim()
  const rendered = renderMarkdown(markdown, { indent: '        ', tocLevels: [2, 3, 4] })
  return {
    available: true,
    sourcePath: path.relative(root, sourcePath),
    sourceLabel: path.basename(sourcePath),
    markdown,
    html: rendered.html,
    toc: rendered.toc,
  }
}

function rewriteMarkdownImages(markdown, note, info, date, imageMap) {
  const copied = new Map()
  const images = []
  const dateSegment = date || note.mmdd

  const rewritten = markdown.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, src) => {
    if (/^https?:\/\//i.test(src)) {
      const cleanAlt = alt.trim()
      images.push({
        alt: cleanAlt || `${info.title} ${date || note.mmdd}`,
        url: src,
        slideNo: extractSlideNo(cleanAlt),
        caption: cleanAlt,
      })
      return match
    }

    const normalizedSrc = normalizeRelativePath(src)
    const sourcePath = path.resolve(note.subjectDir, normalizedSrc)
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`missing image: ${path.relative(root, sourcePath)}`)
    }

    const fileName = path.basename(normalizedSrc)
    const isConvertible = /\.(png|jpe?g)$/i.test(sourcePath)
    const destFileName = isConvertible ? fileName.replace(/\.(png|jpe?g)$/i, '.jpg') : fileName
    const destRelPath = `/course-assets/${info.slug}/${dateSegment}/${destFileName}`
    const destPath = path.join(publicRoot, destRelPath)
    ensureDir(path.dirname(destPath))

    if (!copied.has(destPath)) {
      if (isConvertible) {
        convertToJpg(sourcePath, destPath)
      } else {
        fs.copyFileSync(sourcePath, destPath)
      }
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

function convertToJpg(sourcePath, destPath) {
  try {
    const result = spawnSync(
      'sips',
      ['-s', 'format', 'jpeg', sourcePath, '--out', destPath],
      { stdio: 'ignore' },
    )
    if (result.status !== 0 && fs.existsSync(destPath)) {
      fs.rmSync(destPath, { force: true })
    }
  } catch (_) {
    // Fall back to the original image when sips is unavailable or fails.
  }
}

function renderHtmlPage({
  title,
  description,
  subject,
  date,
  subjectSlug,
  pageUrl,
  markdownUrl,
  clearUrl,
  images,
  clear,
  noteNav,
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
  const tocScript = ''
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
    <aside class="note-rail" id="note-rail">${noteNav}</aside>
    <article class="note">
      <header class="note-header">
        <p class="eyebrow">${escapeHtml(subject)}</p>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(description)}</p>
        <button class="rail-toggle" type="button" data-rail-toggle aria-controls="note-rail" aria-expanded="true">收起左栏</button>
      </header>
      ${renderClearPanel(clear)}
${body}
    </article>
  </main>
  ${tocScript}
  ${noteRailToggleScript()}
  ${noteLastReadScript(pageUrl, subjectSlug)}
</body>
</html>
`
}

function noteRailToggleScript() {
  return `<script>
(() => {
  try {
    const page = document.body;
    const rail = document.getElementById('note-rail');
    const button = document.querySelector('[data-rail-toggle]');
    if (!rail || !button) return;
    const key = 'course:note-rail-collapsed';
    const apply = (collapsed) => {
      page.classList.toggle('note-rail-collapsed', collapsed);
      button.setAttribute('aria-expanded', String(!collapsed));
      button.textContent = collapsed ? '展开左栏' : '收起左栏';
      localStorage.setItem(key, collapsed ? '1' : '0');
    };
    apply(localStorage.getItem(key) === '1');
    button.addEventListener('click', () => {
      apply(!page.classList.contains('note-rail-collapsed'));
    });
  } catch (_) {}
})();
</script>`
}

function noteLastReadScript(pageUrl, subjectSlug) {
  return `<script>
(() => {
  try {
    const slug = ${JSON.stringify(subjectSlug || '')};
    const url = ${JSON.stringify(pageUrl || '')};
    if (!slug || !url) return;
    localStorage.setItem('course:last_read:' + slug, url);
  } catch (_) {}
})();
</script>`
}

function buildNoteNavByPageUrl(bySubjectSlug) {
  const map = new Map()
  for (const [subjectSlug, pages] of Object.entries(bySubjectSlug)) {
    const sorted = pages.slice().sort((a, b) => (a.date || a.mmdd).localeCompare(b.date || b.mmdd))
    for (const page of sorted) {
      map.set(page.pageUrl, renderNoteNav({ subjectSlug, pages: sorted, current: page }))
    }
  }
  return map
}

function renderNoteNav({ subjectSlug, pages, current }) {
  const items = pages
    .map((page, index) => {
      const active = page.pageUrl === current.pageUrl ? ' note-item-active' : ''
      const label = page.date || page.mmdd
      return `<article class="archive-item note-item${active}">
  <span class="archive-number">${String(index + 1).padStart(2, '0')}</span>
  <div>
    <a class="archive-title" href="${page.pageUrl}">${escapeHtml(label)}</a>
  </div>
</article>`
    })
    .join('\n')

  return `<section class="archive-list note-list note-switcher" aria-label="笔记切换">
${items}
</section>`
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

function writeIndexes(pages, examBySubjectSlug) {
  const bySubject = groupBy(pages, (page) => page.subjectSlug)

  writeIndexPage({
    dir: coursesRoot,
    title: '',
    description: '',
    body: renderHome({ bySubject, examBySubjectSlug }),
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

  // Subject index pages are intentionally lightweight: redirect to last-read note (or latest note).
  for (const [subjectSlug, subjectPages] of Object.entries(bySubject)) {
    const subjectDir = path.join(coursesRoot, subjectSlug)
    ensureDir(subjectDir)
    const fallback = getFallbackNoteUrl(bySubject, subjectSlug)
    const title = subjectPages[0]?.subjectTitle || subjectSlug
    fs.writeFileSync(
      path.join(subjectDir, 'index.html'),
      `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta http-equiv="refresh" content="0; url=${escapeHtml(fallback)}">
  <style>${courseCss()}</style>
</head>
<body class="index-page">
  ${siteHeader()}
  <main class="shell">
    <p class="toc-empty">Redirecting…</p>
  </main>
  <script>
  (() => {
    try {
      const slug = ${JSON.stringify(subjectSlug)};
      const fallback = ${JSON.stringify(fallback)};
      const last = localStorage.getItem('course:last_read:' + slug);
      location.replace(last || fallback);
    } catch (_) {}
  })();
  </script>
</body>
</html>
`,
    )
  }
}

function renderHome({ bySubject, examBySubjectSlug }) {
  const homeScript = `${homeCountdownScript()}\n${homeLastReadScript()}`
  return `<div class="home-layout">
  <section class="home-left" aria-label="考试倒计时">
    ${renderExamTable(examBySubjectSlug, bySubject)}
  </section>
  <section class="home-right" aria-label="课程列表">
    ${renderCourseList(bySubject, examBySubjectSlug)}
  </section>
</div>
${homeScript}`
}

function renderExamTable(examBySubjectSlug, bySubject) {
  const rows = Array.from(examBySubjectSlug.entries())
    .map(([subjectSlug, exam]) => {
      const subjectTitle = bySubject?.[subjectSlug]?.[0]?.subjectTitle || exam.course || subjectSlug
      const remainingLabel = exam.start ? renderDaysUntilLabel(exam.start) : '待确认'
      const examTimeLabel = exam.start ? formatExamTimeDisplay(exam.start, exam.end) : '待确认'
      return {
        subjectSlug,
        subjectTitle,
        credits: exam.credits ?? null,
        remainingDays: exam.start ? (exam.start.getTime() - Date.now()) / (24 * 60 * 60 * 1000) : Infinity,
        examTimeLabel,
        remainingLabel,
        start: exam.start,
      }
    })
    .sort((a, b) => {
      if (a.remainingDays !== b.remainingDays) return a.remainingDays - b.remainingDays
      const aCredits = a.credits ?? -Infinity
      const bCredits = b.credits ?? -Infinity
      return bCredits - aCredits
    })

  return `<section class="exam-table" aria-label="考试倒计时">
  <table>
    <thead>
      <tr><th>课程</th><th>学分</th><th>考试时间</th><th>剩余天数</th></tr>
    </thead>
    <tbody>
${rows
  .map((row) => {
    const datetime = row.start ? row.start.toISOString() : ''
    const fallback = getFallbackNoteUrl(bySubject, row.subjectSlug)
    const countdownAttrs = row.start ? renderCountdownAttrs(row.start, 'zh') : ''
    return `<tr>
  <td><a class="home-subject-link" data-subject-slug="${escapeHtml(row.subjectSlug)}" data-fallback-href="${escapeHtml(fallback)}" href="${escapeHtml(fallback)}">${escapeHtml(row.subjectTitle)}</a></td>
  <td>${row.credits ?? ''}</td>
  <td>${row.examTimeLabel === '待确认' ? '待确认' : `<time datetime="${escapeHtml(datetime)}">${escapeHtml(row.examTimeLabel)}</time>`}</td>
  <td class="exam-days"${countdownAttrs}>${escapeHtml(row.remainingLabel)}</td>
</tr>`
  })
  .join('\n')}
    </tbody>
  </table>
</section>`
}

function renderCourseList(bySubject, examBySubjectSlug) {
  const subjects = Object.entries(bySubject).map(([subjectSlug, subjectPages]) => {
    const exam = examBySubjectSlug.get(subjectSlug)
    const examStart = exam?.start || null
    const daysToExam = examStart ? (examStart.getTime() - Date.now()) / (24 * 60 * 60 * 1000) : null
    return { subjectSlug, subjectPages, examStart, daysToExam }
  })
  subjects.sort((a, b) => {
    const aDays = a.daysToExam
    const bDays = b.daysToExam
    if (aDays == null && bDays == null) return localeSort(a.subjectSlug, b.subjectSlug)
    if (aDays == null) return 1
    if (bDays == null) return -1
    return aDays - bDays
  })

  return `<section class="archive-list" aria-label="课程列表">
${subjects
  .map((entry, index) => {
    const { subjectSlug, subjectPages, examStart } = entry
    const first = subjectPages[0]
    const fallback = getFallbackNoteUrl(bySubject, subjectSlug)
    const remaining = examStart
      ? `<span${renderCountdownAttrs(examStart, 'en')}>${escapeHtml(renderRemainingDaysEnglish(examStart))}</span>`
      : ''
    const exam = examBySubjectSlug.get(subjectSlug)
    const examTime = exam?.start ? formatExamTimeDisplay(exam.start, exam.end).replace(/^\d{4}-/, '') : ''
    const credits = exam?.credits != null ? `${exam.credits} 学分` : ''
    const classes = `${subjectPages.length} class`
    const parts = [
      remaining,
      examTime ? escapeHtml(examTime) : '',
      credits ? escapeHtml(credits) : '',
      escapeHtml(classes),
    ].filter(Boolean)
    const meta = parts.join(' / ')
    return `<article class="archive-item subject-card">
  <span class="archive-number">${String(index + 1).padStart(2, '0')}</span>
  <div>
    <a class="archive-title home-subject-link" data-subject-slug="${escapeHtml(subjectSlug)}" data-fallback-href="${escapeHtml(fallback)}" href="${escapeHtml(fallback)}">${escapeHtml(first.subjectTitle)}</a>
    <p class="subject-meta">${meta}</p>
  </div>
  <span class="archive-code">${escapeHtml(subjectSlug)}</span>
</article>`
  })
  .join('\n')}
</section>`
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
  <main class="shell">
    ${body}
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
  <meta name="theme-color" content="#f7f3ea">
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

function getFallbackNoteUrl(bySubject, subjectSlug) {
  const pages = bySubject?.[subjectSlug] || []
  if (!pages.length) return absoluteUrl('/courses/')
  const sorted = pages.slice().sort((a, b) => (a.date || a.mmdd).localeCompare(b.date || b.mmdd))
  return sorted[sorted.length - 1].pageUrl
}

function renderCountdownAttrs(examStart, format) {
  return ` data-countdown data-countdown-format="${escapeHtml(format)}" data-exam-start="${escapeHtml(examStart.toISOString())}"`
}

function homeCountdownScript() {
  return `<script>
(() => {
  const targets = Array.from(document.querySelectorAll('[data-countdown][data-exam-start]'));
  if (!targets.length) return;

  const msPerDay = 24 * 60 * 60 * 1000;
  const formatCountdown = (date, mode) => {
    const ms = date.getTime() - Date.now();
    if (mode === 'en') {
      if (ms < 0) return 'Done';
      return (Math.round((ms / msPerDay) * 10) / 10) + ' Days';
    }
    if (ms < 0) return '已考试';
    const days = Math.round((ms / msPerDay) * 10) / 10;
    if (days === 0) return '今天考试';
    return days + ' 天';
  };

  const update = () => {
    for (const target of targets) {
      const date = new Date(target.getAttribute('data-exam-start'));
      if (Number.isNaN(date.getTime())) continue;
      target.textContent = formatCountdown(date, target.getAttribute('data-countdown-format') || 'zh');
    }
  };

  update();
  window.setInterval(update, 30 * 1000);
})();
</script>`
}

function homeLastReadScript() {
  return `<script>
(() => {
  const links = Array.from(document.querySelectorAll('.home-subject-link[data-subject-slug]'));
  if (!links.length) return;
  const keyFor = (slug) => 'course:last_read:' + slug;
  for (const link of links) {
    link.addEventListener('click', (event) => {
      const slug = link.getAttribute('data-subject-slug');
      const fallback = link.getAttribute('data-fallback-href') || link.getAttribute('href');
      if (!slug) return;
      const last = localStorage.getItem(keyFor(slug));
      const target = last || fallback;
      if (!target) return;
      event.preventDefault();
      location.href = target;
    });
  }
})();
</script>`
}

function renderSubjectCards(bySubject, examBySubjectSlug) {
  return renderCourseList(bySubject, examBySubjectSlug)
}

function renderPageCards(pages, examInfo) {
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
        const fallback = getFallbackNoteUrl(bySubject, subjectSlug)
        return `- ${first.subjectTitle}: ${fallback}`
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
  return renderMarkdown(markdown, options).html
}

function renderMarkdown(markdown, options = {}) {
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
      const rawText = heading[2].trim()
      const plainText = stripInlineMarkup(rawText)
      const id = uniqueSlug(slugifyHeading(plainText), slugCounts)
      html.push(
        `<h${level} id="${escapeHtml(id)}" data-heading-level="${level}">${renderInline(rawText)}</h${level}>`,
      )
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

  return { html: html.map((line) => `${indent}${line}`).join('\n'), toc }
}

function renderFigure(src, alt) {
  const loading = renderFigure.loadingIndex++ === 0 ? 'eager' : 'lazy'
  return `<figure>
  <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="${loading}" decoding="async" fetchpriority="${loading === 'eager' ? 'high' : 'auto'}">
  <figcaption>${escapeHtml(alt)}</figcaption>
</figure>`
}

renderFigure.loadingIndex = 0

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

function stripInlineMarkup(text) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugifyHeading(text) {
  const base = String(text)
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\p{L}\p{N}\s-]+/gu, '')
    .trim()
    .replace(/\s+/g, '-')
  return base || 'section'
}

function uniqueSlug(base, counts) {
  const current = counts.get(base) || 0
  counts.set(base, current + 1)
  if (current === 0) return base
  return `${base}-${current + 1}`
}

function renderToc(toc) {
  if (!toc || !toc.length) {
    return `<nav class="toc" aria-label="目录">
  <p class="toc-title">目录</p>
  <p class="toc-empty">无目录</p>
</nav>`
  }

  return `<nav class="toc" aria-label="目录">
  <p class="toc-title">目录</p>
  <ol class="toc-list">
${toc
  .map(
    (item) =>
      `    <li class="toc-item toc-level-${item.level}"><a href="#${escapeHtml(item.id)}" data-toc-link="${escapeHtml(item.id)}">${escapeHtml(item.text)}</a></li>`,
  )
  .join('\n')}
  </ol>
</nav>`
}

function tocScrollSpyScript() {
  return `<script>
(() => {
  const links = Array.from(document.querySelectorAll('[data-toc-link]'));
  if (!links.length) return;

  const sections = links
    .map((link) => document.getElementById(link.getAttribute('data-toc-link')))
    .filter(Boolean);
  if (!sections.length) return;

  const linkById = new Map(links.map((link) => [link.getAttribute('data-toc-link'), link]));
  let activeId = null;

  const setActive = (id) => {
    if (!id || id === activeId) return;
    activeId = id;
    for (const link of links) link.classList.toggle('is-active', link.getAttribute('data-toc-link') === id);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id);
    },
    { rootMargin: '-30% 0px -60% 0px', threshold: [0, 1] },
  );

  for (const section of sections) observer.observe(section);

  const initial = location.hash ? location.hash.slice(1) : sections[0].id;
  setActive(initial);
})();
</script>`
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
  let paragraph = []
  let listType = null // 'ul' | 'ol' | null
  let listItems = []

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push(`<p>${renderInline(paragraph.join(' '))}</p>`)
    paragraph = []
  }

  const flushList = () => {
    if (!listType || !listItems.length) {
      listType = null
      listItems = []
      return
    }
    blocks.push(
      `<${listType}>${listItems.map((item) => `<li>${renderInline(item)}</li>`).join('')}</${listType}>`,
    )
    listType = null
    listItems = []
  }

  for (const rawLine of lines) {
    const line = rawLine ?? ''

    if (!line.trim()) {
      flushParagraph()
      flushList()
      continue
    }

    const unordered = line.match(/^\s*[-*]\s+(.+)$/)
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (unordered || ordered) {
      flushParagraph()
      const desired = ordered ? 'ol' : 'ul'
      if (listType && listType !== desired) flushList()
      listType = desired
      listItems.push((unordered || ordered)[1])
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }

  flushParagraph()
  flushList()
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
  const detail = (meta.selection_text || meta.reason || '').replace(/\s+/g, ' ').trim()
  if (!detail) return base
  return `${base}: ${truncate(detail, 90)}`
}

function buildCaption(meta) {
  const parts = []
  if (meta.slide_no) parts.push(`slide ${meta.slide_no}`)
  if (meta.selection_text) {
    parts.push(truncate(meta.selection_text.replace(/\s+/g, ' ').trim(), 120))
  } else if (meta.reason) {
    parts.push(truncate(meta.reason.replace(/\s+/g, ' ').trim(), 120))
  }
  return parts.join(': ')
}

function extractSlideNo(text) {
  const match = String(text || '').match(/slide\s*(\d+)/i)
  return match ? Number(match[1]) : undefined
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
  color-scheme: light;
  --background: #f7f3ea;
  --panel: #fffdf8;
  --panel-soft: #f1ebde;
  --foreground: #20170f;
  --muted: #6d6252;
  --muted-soft: #8c7c67;
  --border: rgba(66, 52, 32, 0.12);
  --border-strong: rgba(66, 52, 32, 0.22);
  --accent: #9b6a1f;
  --accent-soft: rgba(155, 106, 31, 0.1);
  --danger: #b44d3a;
  --surface-glass: rgba(255, 252, 246, 0.82);
  --surface-soft: rgba(255, 250, 242, 0.72);
  --grid: rgba(81, 63, 39, 0.03);
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
body.note-page {
  overflow: hidden;
}
body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(circle at 86% 8%, rgba(213, 171, 103, 0.14), transparent 26rem),
    radial-gradient(circle at 8% 90%, rgba(177, 135, 72, 0.1), transparent 24rem),
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: auto, auto, 64px 64px, 64px 64px;
  background-position: 0 0, 0 0, 0 0, 0 0;
}
body::after {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.32), rgba(247, 243, 234, 0.68));
}
body.note-page::after {
  background: transparent;
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
  background: var(--surface-glass);
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
body.note-page .shell {
  height: 100svh;
  padding: var(--header-height) 0 0 !important;
}
.home-layout {
  display: grid;
  grid-template-columns: minmax(16rem, 25rem) minmax(0, 1fr);
  gap: clamp(2rem, 5vw, 5rem);
  align-items: start;
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
  top: calc(var(--header-height) + 1.35rem);
  align-self: start;
  padding: 1.15rem 1.05rem 1.3rem;
  border: 1px solid var(--border);
  border-radius: 24px;
  background: rgba(255, 252, 246, 0.86);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 44px rgba(65, 49, 29, 0.08);
}
.hero-panel {
  min-height: calc(100svh - var(--header-height) - 7rem);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.note-rail {
  display: grid;
  gap: 0.35rem;
  max-height: calc(100svh - var(--header-height) - 2.7rem);
  overflow: hidden;
}
body.note-page .note-shell {
  height: calc(100svh - var(--header-height));
  align-items: stretch;
}
body.note-page .note-rail,
body.note-page .note {
  position: relative;
  top: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
body.note-page .note-rail {
  height: calc(100% - 1.25rem);
  margin-top: 1.25rem;
}
body.note-page .note {
  height: 100%;
  overflow: auto;
}
body.note-page .note {
  padding-bottom: 1rem;
}
body.note-rail-collapsed .note-shell {
  grid-template-columns: 0 minmax(0, 1fr);
}
body.note-rail-collapsed .note-rail {
  width: 0;
  min-width: 0;
  padding: 0;
  border: 0;
  overflow: hidden;
}
body.note-rail-collapsed .note {
  width: 100%;
}
.rail-toggle {
  margin-top: 0.85rem;
  padding: 0.45rem 0.8rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--foreground);
  cursor: pointer;
}
.rail-toggle:hover {
  background: rgba(155, 106, 31, 0.16);
}
.rail-toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.toc {
  display: grid;
  gap: 0.8rem;
  align-content: start;
  width: 100%;
  max-height: calc(100svh - var(--header-height) - 6rem);
  overflow: auto;
  padding-right: 0.25rem;
}
.toc-title {
  margin: 0;
  color: var(--muted-soft);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.toc-empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.toc-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
}
.toc-item {
  margin: 0;
}
.toc-item a {
  display: block;
  padding: 0.25rem 0.4rem;
  border-left: 2px solid transparent;
  border-radius: 8px;
  color: color-mix(in oklab, var(--foreground) 72%, var(--muted));
  text-decoration: none;
  font-size: 0.92rem;
  line-height: 1.35;
}
.toc-item a:hover {
  color: var(--foreground);
  background: rgba(155, 106, 31, 0.06);
}
.toc-item a.is-active {
  color: var(--foreground);
  border-left-color: var(--accent);
  background: rgba(155, 106, 31, 0.12);
}
.note-item-active .archive-title {
  color: var(--accent);
}
.toc-level-3 a {
  padding-left: 0.9rem;
  font-size: 0.88rem;
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
  background: #fbf8f2;
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
.callout-body ul,
.callout-body ol {
  margin: 0.4rem 0 0.2rem;
  padding-left: 1.25rem;
}
.callout-body li {
  margin: 0.15rem 0;
}
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
  background: var(--panel-soft);
  color: var(--foreground);
}
code { font-family: "JetBrains Mono", monospace; }
.clear-panel {
  margin: 0 0 2.8rem;
  border-top: 1px solid var(--border-strong);
  border-bottom: 1px solid var(--border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(241, 235, 222, 0.44));
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
.subject-meta {
  margin-top: 0.65rem;
  color: color-mix(in oklab, var(--foreground) 82%, var(--muted));
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.base-snippet {
  margin: 0 0 1.8rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-soft);
}
.base-snippet pre {
  margin: 0;
  overflow: auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: color-mix(in oklab, var(--foreground) 84%, var(--muted));
}
.base-snippet code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  line-height: 1.6;
}
.exam-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.45rem;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--foreground);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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
.exam-table {
  margin: 0 0 1.8rem;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-soft);
}
.exam-table table {
  width: 100%;
  border-collapse: collapse;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
}
.exam-table th,
.exam-table td {
  padding: 0.55rem 0.4rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: middle;
}
.exam-table th {
  color: var(--muted);
  font-weight: 650;
  text-transform: uppercase;
}
.exam-table td {
  color: color-mix(in oklab, var(--foreground) 82%, var(--muted));
}
.exam-table td a {
  color: var(--foreground);
  text-decoration: none;
}
.exam-table td a:hover {
  color: var(--accent);
}
.exam-table .exam-days {
  color: var(--foreground);
  white-space: nowrap;
}
@media (max-width: 900px) {
  .index-shell,
  .note-shell {
    grid-template-columns: 1fr;
  }
  .home-layout {
    grid-template-columns: 1fr;
  }
  .hero-panel,
  .note-rail {
    position: static;
    min-height: 0;
    max-height: none;
    padding: 1rem;
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
  .note-rail {
    display: none;
  }
  .exam-table {
    padding: 0.85rem 0.9rem;
  }
  .exam-table th:nth-child(2),
  .exam-table td:nth-child(2) {
    display: none;
  }
}
`
}
