## Task

把课程站改成“线上旧页基线 + 本地新增课次增量发布”的安全模式，并上线白色主题。

## What Was Changed

- 恢复并确认本地 `note` 仓库标准路径为 `/Users/a123/note`
- 为课程站新增 `scripts/build-course-stage-source.mjs`
- 课程站新增安全构建命令 `build:courses:stage`
- `deploy` 改为：
  - `npm run build`
  - `npm run build:courses:stage`
  - `wrangler deploy`
- 课程站支持新科目 `安原 / 安全学原理`
- 图片 alt/caption 改为优先 `selection_text`
- 课程站首页、详情页、knowledge 页统一切到白色模式

## Verified Outputs

- 本地 `npm run build` 成功
- 本地 `npm run build:courses:stage` 成功
- Cloudflare 发布成功
- 线上版本 ID：`9e7824a9-da7b-4617-b9dc-8b12fbc959d8`

## Verified Online Pages

- `https://courses.20060618.xyz/`
- `https://courses.20060618.xyz/huhuan/2026-05-14/`
- `https://courses.20060618.xyz/dawu/2026-05-13/`
- `https://courses.20060618.xyz/anyuan/2026-05-19/`

## Incremental Lessons Added In This Publish

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

## Local Recovery Notes

- 旧的非标准 `/Users/a123/note` 目录已备份到：
  - `/Users/a123/note.backup-20260526-151537`
- 当前正式工作副本：
  - `/Users/a123/note`

## Known Boundaries

- 仓库里仍有未纳入本次提交的既有脏改：
  - `docs/ai-context.md`
  - `.stitch/`
- 这些不应和本次“安全增量发站”提交混在一起。
