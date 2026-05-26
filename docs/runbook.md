## Purpose

这份 runbook 记录当前课程站的安全增量发布方式，目标是：

- 线上旧页不被本地不完整课程源覆盖
- 只把本地“已跑好且线上缺失”的课次增量发到 `courses.20060618.xyz`
- 保持课程站白色模式和现有发布链路可复现

## Prerequisites

- 课程站仓库：`/Users/a123/Desktop/Obsidian-blog/99-临时/courses_webui`
- 课程源：`/Users/a123/Desktop/Obsidian-blog/03-领域/课程录音`
- 线上基线：`https://courses.20060618.xyz/`
- 可用 Node / npm
- 可用 `wrangler` 登录态

## Key Scripts

- `npm run build`
  - 构建知识页 `knowledge/2html`
- `npm run build:courses`
  - 直接从本地课程源构建课程站，不适合当前“旧页优先”的生产发布
- `npm run build:courses:stage`
  - 先抓线上基线页，再并入本地新增课次，最后重建课程站
- `npm run deploy`
  - 先跑 `build`
  - 再跑 `build:courses:stage`
  - 再执行 `wrangler deploy`

## Safe Publish Flow

1. 安装依赖

```bash
cd /Users/a123/Desktop/Obsidian-blog/99-临时/courses_webui
npm install
```

2. 本地重建安全增量站点

```bash
npm run build:courses:stage
```

3. 抽样验证

- 检查 `dist-course-site/index.html`
- 检查一个旧页，例如 `dist-course-site/huhuan/2026-04-30/index.md`
- 检查一个新增页，例如 `dist-course-site/huhuan/2026-05-14/index.md`
- 检查新科目，例如 `dist-course-site/anyuan/2026-05-19/index.md`

4. 发布

```bash
npm run deploy
```

## Notes

- `scripts/build-course-stage-source.mjs` 会把线上稳定页抓到 `tmp/course-source-stage`，然后自动并入本地新增完成课次。
- 当前已支持本地目录 `安全学原理` 映射成线上 slug `anyuan`。
- 图片 alt / caption 优先使用 `selection_text`，避免 `reason` 字段乱码污染。
- `tmp/` 已加入 `.gitignore`，中间 staging 目录不进版本控制。

## Troubleshooting

- 如果 `wrangler` 起不来，先执行一次 `npm install`，确保本地 `node_modules` 和 `esbuild` 二进制完整。
- 如果线上某一页抓取异常，先单独运行：

```bash
node scripts/build-course-stage-source.mjs
```

它会逐页打印进度，便于定位哪一页或哪一步卡住。
