## Research Summary

- 线上 `course-sitemap.xml` 当前共有 `127` 个 URL，其中课程详情页 `63` 个。
- 线上已发布课程详情页分布：
  - `dawu: 18`
  - `ranbao: 11`
  - `gongcai: 10`
  - `rechuan: 10`
  - `huhuan: 6`
  - `fagui: 5`
  - `anhua: 3`
- 线上课程详情页支持直接抓取镜像 Markdown：
  - `/{slug}/{date}/index.md`
  - `/{slug}/{date}/clear.md`
- 抓到的 `index.md` 结构为：
  - frontmatter
  - 自动生成的 `# 标题`
  - 自动生成的描述段
  - 原始正文
- 抓到的 `clear.md` 结构为：
  - frontmatter
  - 自动生成的 `# ... clear 原文`
  - 原始 clear Markdown
- 因此线上稳定页可复用，但需要先剥离自动包裹层，不能直接当 `_with_ima.md` 输入。

## New Completed Notes Not Yet Online

- `互换/0507`
- `互换/0514`
- `大物/0506`
- `大物/0513`
- `工材/0519`
- `热传/0423`
- `热传/0507`
- `热传/0512`
- `热传/0521`
- `安全学原理/0519`

## Image Metadata Finding

- 本地 `*-note.illustrated.images.json` 中 `reason` 字段大量乱码。
- `selection_text` 字段保留了正常中文，可作为更优先的 alt 文本来源。

## Conclusion

基线来源应该是线上页，增量来源应该是本地“有图的 note.illustrated”，而不是直接拿当前 Obsidian 整棵课程目录全量重建。
