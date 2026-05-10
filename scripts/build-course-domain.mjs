import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const publicRoot = path.join(root, 'public')
const outRoot = path.join(root, 'dist-course-site')
const mainSiteUrl = 'https://20060618.xyz'
const courseSiteUrl = process.env.COURSE_DOMAIN_URL || 'https://courses.20060618.xyz'

main()

function main() {
  fs.rmSync(outRoot, { recursive: true, force: true })
  fs.mkdirSync(outRoot, { recursive: true })

  copyTree(path.join(publicRoot, 'courses'), outRoot)
  copyTree(path.join(publicRoot, 'course-assets'), path.join(outRoot, 'course-assets'))

  for (const fileName of [
    'llms.txt',
    'llms-full.txt',
    'course-sitemap.xml',
    'favicon.ico',
    'favicon.svg',
    'apple-touch-icon.png',
    'site.webmanifest',
    'web-app-manifest-512x512.png',
  ]) {
    copyFile(path.join(publicRoot, fileName), path.join(outRoot, fileName))
  }

  writeRobots()
  writeHeaders()
  rewriteTextUrls(outRoot)

  console.log(`[course-domain] generated ${path.relative(root, outRoot)} for ${courseSiteUrl}`)
}

function copyTree(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`missing source: ${src}`)
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src)) {
      copyTree(path.join(src, entry), path.join(dest, entry))
    }
    return
  }
  copyFile(src, dest)
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

function writeRobots() {
  fs.writeFileSync(
    path.join(outRoot, 'robots.txt'),
    `User-agent: *
Allow: /

Sitemap: ${courseSiteUrl}/course-sitemap.xml
`,
  )
}

function writeHeaders() {
  fs.writeFileSync(
    path.join(outRoot, '_headers'),
    `/*
  Cache-Control: public, max-age=300, stale-while-revalidate=86400
  CDN-Cache-Control: public, max-age=300, stale-while-revalidate=86400

/course-assets/*
  ! Cache-Control
  ! CDN-Cache-Control
  Cache-Control: public, max-age=31536000, immutable
  CDN-Cache-Control: public, max-age=31536000, immutable

/favicon.ico
  ! Cache-Control
  ! CDN-Cache-Control
  Cache-Control: public, max-age=31536000, immutable
  CDN-Cache-Control: public, max-age=31536000, immutable

/favicon.svg
  ! Cache-Control
  ! CDN-Cache-Control
  Cache-Control: public, max-age=31536000, immutable
  CDN-Cache-Control: public, max-age=31536000, immutable

/apple-touch-icon.png
  ! Cache-Control
  ! CDN-Cache-Control
  Cache-Control: public, max-age=31536000, immutable
  CDN-Cache-Control: public, max-age=31536000, immutable

/web-app-manifest-512x512.png
  ! Cache-Control
  ! CDN-Cache-Control
  Cache-Control: public, max-age=31536000, immutable
  CDN-Cache-Control: public, max-age=31536000, immutable
`,
  )
}

function rewriteTextUrls(dir) {
  for (const entry of fs.readdirSync(dir)) {
    const filePath = path.join(dir, entry)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      rewriteTextUrls(filePath)
      continue
    }

    if (!/\.(html|md|txt|xml)$/.test(entry)) continue
    const original = fs.readFileSync(filePath, 'utf8')
    const rewritten = original
      .replaceAll(`${mainSiteUrl}/favicon.ico`, `${courseSiteUrl}/favicon.ico`)
      .replaceAll(`${mainSiteUrl}/favicon.svg`, `${courseSiteUrl}/favicon.svg`)
      .replaceAll(`${mainSiteUrl}/apple-touch-icon.png`, `${courseSiteUrl}/apple-touch-icon.png`)
      .replaceAll(`${mainSiteUrl}/site.webmanifest`, `${courseSiteUrl}/site.webmanifest`)
      .replaceAll(`${mainSiteUrl}/web-app-manifest-512x512.png`, `${courseSiteUrl}/web-app-manifest-512x512.png`)
      .replaceAll(`${mainSiteUrl}/courses/`, `${courseSiteUrl}/`)
      .replaceAll(`${mainSiteUrl}/course-assets/`, `${courseSiteUrl}/course-assets/`)
      .replaceAll(`${mainSiteUrl}/llms`, `${courseSiteUrl}/llms`)
      .replaceAll(`${mainSiteUrl}/course-sitemap.xml`, `${courseSiteUrl}/course-sitemap.xml`)

    if (rewritten !== original) fs.writeFileSync(filePath, rewritten)
  }
}
