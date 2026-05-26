import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const stageRoot = path.resolve(
  root,
  process.env.COURSE_STAGE_ROOT || 'tmp/course-source-stage',
)
const localSourceRoot = path.resolve(
  process.env.LOCAL_COURSE_NOTE_ROOT ||
    '/Users/a123/Desktop/Obsidian-blog/03-领域/课程录音',
)
const courseSiteUrl = normalizeSiteUrl(
  process.env.COURSE_DOMAIN_URL || 'https://courses.20060618.xyz',
)

const slugToStageSubject = {
  huhuan: '互换',
  zhitu: '制图',
  dawu: '大物',
  anhua: '安化',
  gongcai: '工材',
  fagui: '法规',
  rechuan: '热传',
  ranbao: '燃爆',
  anyuan: '安原',
}

const localSubjectToStageSubject = {
  互换: '互换',
  制图: '制图',
  大物: '大物',
  安化: '安化',
  工材: '工材',
  法规: '法规',
  热传: '热传',
  燃爆: '燃爆',
  安全学原理: '安原',
}

const summaryPathBySlug = {
  ranbao: '燃爆复习总纲.md',
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(`[course-stage] ${error.stack || error.message}`)
    process.exit(1)
  })

async function main() {
  fs.rmSync(stageRoot, { recursive: true, force: true })
  ensureDir(stageRoot)

  const sitemapXml = await fetchText(`${courseSiteUrl}/course-sitemap.xml`)
  const entries = parseSitemap(sitemapXml)
  const onlineKeys = new Set()
  let fetchedPages = 0

  for (const entry of entries) {
    if (entry.kind === 'note') {
      const stageSubject = slugToStageSubject[entry.slug]
      if (!stageSubject) continue
      console.log(`[course-stage] online note ${entry.slug}/${entry.date}`)
      onlineKeys.add(`${entry.slug}:${entry.date}`)
      await stageOnlineNote({ ...entry, stageSubject })
      fetchedPages += 1
      continue
    }

    if (entry.kind === 'summary') {
      const stageSubject = slugToStageSubject[entry.slug]
      if (!stageSubject) continue
      console.log(`[course-stage] online summary ${entry.slug}`)
      await stageOnlineSummary({ ...entry, stageSubject })
      fetchedPages += 1
    }
  }

  console.log('[course-stage] merge local completed notes')
  const addedLocal = stageLocalCompletedNotes(onlineKeys)

  console.log(
    `[course-stage] staged ${fetchedPages} online pages + ${addedLocal.length} local increments into ${path.relative(root, stageRoot)}`,
  )
  for (const item of addedLocal) {
    console.log(
      `[course-stage] local increment ${item.stageSubject}/${item.mmdd} <- ${path.relative(root, item.mdPath)}`,
    )
  }
}

function stageLocalCompletedNotes(onlineKeys) {
  if (!fs.existsSync(localSourceRoot)) {
    throw new Error(`missing local course source root: ${localSourceRoot}`)
  }

  const staged = []
  for (const [localSubject, stageSubject] of Object.entries(localSubjectToStageSubject)) {
    const localSubjectDir = path.join(localSourceRoot, localSubject)
    if (!fs.existsSync(localSubjectDir)) continue

    for (const entry of fs.readdirSync(localSubjectDir).sort(localeSort)) {
      if (!entry.endsWith('-note.illustrated.md')) continue
      const mmdd = entry.replace(/-note\.illustrated\.md$/, '')
      if (!/^\d{4}$/.test(mmdd)) continue

      const imagesJsonPath = path.join(
        localSubjectDir,
        'tmp',
        `${mmdd}-note.illustrated.images.json`,
      )
      const imageCount = countImages(imagesJsonPath)
      if (imageCount <= 0) continue

      const slug = stageSubjectToSlug(stageSubject)
      const date = `2026-${mmdd.slice(0, 2)}-${mmdd.slice(2)}`
      if (onlineKeys.has(`${slug}:${date}`)) continue

      const stageSubjectDir = path.join(stageRoot, stageSubject)
      ensureDir(stageSubjectDir)

      const sourceMdPath = path.join(localSubjectDir, entry)
      fs.copyFileSync(sourceMdPath, path.join(stageSubjectDir, `${mmdd}_with_ima.md`))
      fs.copyFileSync(
        imagesJsonPath,
        path.join(stageSubjectDir, `${mmdd}_with_ima.images.json`),
      )

      const clearSource = findLocalClearSource(localSubjectDir, mmdd)
      if (clearSource) {
        fs.copyFileSync(clearSource, path.join(stageSubjectDir, `${mmdd}-clear.md`))
      }

      ensureAssetsSymlink(stageSubjectDir, path.join(localSubjectDir, 'assets'))
      staged.push({ stageSubject, mmdd, mdPath: sourceMdPath })
    }
  }

  return staged
}

async function stageOnlineNote({ slug, date, stageSubject }) {
  const mmdd = date.slice(5).replace('-', '')
  const stageSubjectDir = path.join(stageRoot, stageSubject)
  ensureDir(stageSubjectDir)

  const noteUrl = `${courseSiteUrl}/${slug}/${date}/index.md`
  const noteRaw = await fetchText(noteUrl)
  const note = unwrapGeneratedMarkdown(noteRaw, { removeDescription: true })
  const noteBody = await stageRemoteMarkdownAssets(note.body, stageSubjectDir, stageSubject)
  const subjectValue = note.data.subject || stageSubject
  const frontmatter = [
    '---',
    `date: ${date}`,
    `subject: ${yamlString(subjectValue)}`,
    `source: ${yamlString(noteUrl)}`,
    '---',
    '',
  ].join('\n')
  fs.writeFileSync(
    path.join(stageSubjectDir, `${mmdd}_with_ima.md`),
    `${frontmatter}${noteBody.trim()}\n`,
  )

  const clearUrl = `${courseSiteUrl}/${slug}/${date}/clear.md`
  const clearRaw = await fetchText(clearUrl, { allow404: true })
  if (clearRaw == null) return
  const clear = unwrapGeneratedMarkdown(clearRaw, { removeDescription: false })
  const clearFrontmatter = [
    '---',
    `date: ${date}`,
    `subject: ${yamlString(subjectValue)}`,
    `source: ${yamlString(clearUrl)}`,
    '---',
    '',
  ].join('\n')
  fs.writeFileSync(
    path.join(stageSubjectDir, `${mmdd}-clear.md`),
    `${clearFrontmatter}${clear.body.trim()}\n`,
  )
}

async function stageRemoteMarkdownAssets(markdown, stageSubjectDir, stageSubject) {
  const assetsDir = path.join(stageSubjectDir, 'assets')
  let rewritten = markdown
  const matches = [...markdown.matchAll(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)]
  for (const match of matches) {
    const src = match[2]
    if (!isCourseAssetUrl(src)) continue
    const remoteFileName = path.basename(new URL(src).pathname)
    const localSourcePath = resolveLocalAssetPath(stageSubject, remoteFileName)
    const fileName = localSourcePath ? path.basename(localSourcePath) : remoteFileName
    const relativePath = `assets/${fileName}`
    const targetPath = path.join(assetsDir, fileName)
    ensureDir(assetsDir)
    if (!fs.existsSync(targetPath)) {
      try {
        if (localSourcePath) {
          fs.copyFileSync(localSourcePath, targetPath)
        } else {
          await downloadBinary(src, targetPath)
        }
      } catch (error) {
        console.warn(`[course-stage] asset fallback failed for ${src}: ${error.message}`)
        const label = match[1]?.trim() || fileName
        rewritten = rewritten.replace(match[0], `> [缺失插图] ${label}`)
        continue
      }
    }
    rewritten = rewritten.replace(match[0], `![${match[1]}](${relativePath})`)
  }
  return rewritten
}

function resolveLocalAssetPath(stageSubject, remoteFileName) {
  const localSubject = Object.keys(localSubjectToStageSubject).find(
    (name) => localSubjectToStageSubject[name] === stageSubject,
  )
  if (!localSubject) return ''
  const assetsDir = path.join(localSourceRoot, localSubject, 'assets')
  if (!fs.existsSync(assetsDir)) return ''
  const stem = path.parse(remoteFileName).name
  for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.gif']) {
    const candidate = path.join(assetsDir, `${stem}${ext}`)
    if (fs.existsSync(candidate)) return candidate
  }
  return ''
}

function isCourseAssetUrl(url) {
  return /^https?:\/\/(?:courses\.20060618\.xyz|20060618\.xyz)\/course-assets\//.test(url)
}

async function downloadBinary(url, filePath) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!response.ok) {
    throw new Error(`asset fetch failed ${response.status} for ${url}`)
  }
  const bytes = Buffer.from(await response.arrayBuffer())
  fs.writeFileSync(filePath, bytes)
}

async function stageOnlineSummary({ slug, stageSubject }) {
  const outputName = summaryPathBySlug[slug]
  if (!outputName) return
  const stageSubjectDir = path.join(stageRoot, stageSubject)
  ensureDir(stageSubjectDir)

  const summaryUrl = `${courseSiteUrl}/${slug}/review-outline/index.md`
  const summaryRaw = await fetchText(summaryUrl)
  const summary = unwrapGeneratedMarkdown(summaryRaw, { removeDescription: true })
  const subjectValue = summary.data.subject || stageSubject
  const frontmatter = [
    '---',
    `subject: ${yamlString(subjectValue)}`,
    `source: ${yamlString(summaryUrl)}`,
    '---',
    '',
  ].join('\n')
  fs.writeFileSync(
    path.join(stageSubjectDir, outputName),
    `${frontmatter}${summary.body.trim()}\n`,
  )
}

function findLocalClearSource(subjectDir, mmdd) {
  const candidates = [
    path.join(subjectDir, `${mmdd}-clear.md`),
    path.join(subjectDir, `${mmdd}-manual-cleaned.md`),
    path.join(subjectDir, `${mmdd}-note.clean.md`),
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) || ''
}

function ensureAssetsSymlink(stageSubjectDir, sourceAssetsDir) {
  if (!fs.existsSync(sourceAssetsDir)) return
  const linkPath = path.join(stageSubjectDir, 'assets')
  if (fs.existsSync(linkPath)) return
  fs.symlinkSync(sourceAssetsDir, linkPath, 'dir')
}

function countImages(jsonPath) {
  if (!fs.existsSync(jsonPath)) return 0
  try {
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
    return Array.isArray(parsed.images) ? parsed.images.length : 0
  } catch {
    return 0
  }
}

function unwrapGeneratedMarkdown(raw, { removeDescription }) {
  const { data, body } = parseFrontmatter(raw)
  const lines = body.replace(/\r\n/g, '\n').split('\n')
  const titleLine = data.title ? `# ${data.title}` : ''
  const description = data.description ? String(data.description).trim() : ''
  let index = 0

  while (index < lines.length && !lines[index].trim()) index += 1
  if (titleLine && lines[index]?.trim() === titleLine.trim()) index += 1
  while (index < lines.length && !lines[index].trim()) index += 1
  if (removeDescription && description && lines[index]?.trim() === description) index += 1
  while (index < lines.length && !lines[index].trim()) index += 1

  return {
    data,
    body: lines.slice(index).join('\n').trim(),
  }
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---\n')) return { data: {}, body: raw }
  const end = raw.indexOf('\n---\n', 4)
  if (end === -1) return { data: {}, body: raw }

  const frontmatter = raw.slice(4, end)
  const body = raw.slice(end + 5)
  const data = {}

  for (const line of frontmatter.split('\n')) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!match) continue
    const [, key, value] = match
    data[key] = unquote(value.trim())
  }

  return { data, body }
}

async function fetchText(url, { allow404 = false } = {}) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (allow404 && response.status === 404) return null
  if (!response.ok) {
    throw new Error(`fetch failed ${response.status} for ${url}`)
  }
  return await response.text()
}

function parseSitemap(xml) {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1].trim())
  const entries = []
  for (const url of urls) {
    const summaryMatch = url.match(
      /^https:\/\/courses\.20060618\.xyz\/([^/]+)\/review-outline\/$/,
    )
    if (summaryMatch) {
      entries.push({ kind: 'summary', slug: summaryMatch[1] })
      continue
    }

    const noteMatch = url.match(
      /^https:\/\/courses\.20060618\.xyz\/([^/]+)\/(\d{4}-\d{2}-\d{2})\/$/,
    )
    if (noteMatch) {
      entries.push({ kind: 'note', slug: noteMatch[1], date: noteMatch[2] })
    }
  }
  return entries
}

function stageSubjectToSlug(stageSubject) {
  for (const [slug, subject] of Object.entries(slugToStageSubject)) {
    if (subject === stageSubject) return slug
  }
  throw new Error(`missing slug for stage subject: ${stageSubject}`)
}

function yamlString(value) {
  return JSON.stringify(String(value))
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function normalizeSiteUrl(value) {
  return String(value).replace(/\/+$/, '')
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

function localeSort(a, b) {
  return a.localeCompare(b, 'zh-CN')
}
