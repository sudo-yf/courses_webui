## Repository

- GitHub: `https://github.com/sudo-yf/courses_webui`
- Local clone: `/Users/a123/Desktop/Obsidian-blog/99-临时/courses_webui`

## Reading Methods Used

- local clone
- local README / scripts / package inspection
- live site inspection
- live sitemap / live Markdown fetch
- `https://zread.ai/sudo-yf/courses_webui` attempted first but did not return usable content in this turn

## Files / Pages Read

- `README.md`
- `package.json`
- `scripts/build-course-recordings.mjs`
- `scripts/build-course-domain.mjs`
- `scripts/md-renderer.mjs`
- `https://courses.20060618.xyz/`
- `https://courses.20060618.xyz/course-sitemap.xml`
- representative `index.md` / `clear.md`

## Key Extracted Patterns

- 仓库是课程站真实源码，`wrangler.toml` / `package.json` 指向 `dist-course-site` 发布。
- 课程生成器原本只吃 `*_with_ima.md`。
- 线上旧页可通过镜像 Markdown 回收，但需要反解自动包裹层。
- 课程样式主要集中在 `build-course-recordings.mjs` 的 `courseCss()`，`md-renderer.mjs` 维护一个简化同步版本。

## Rejected Paths

- 直接用当前本地 Obsidian 课程目录全量 build：会把线上旧页稳定内容替换掉。
- 手工单页上传：无法稳妥保持站点索引、sitemap 与导航一致。

## Mapping Into Local Changes

- 新增 staging source 构建脚本
- 更新课程生成器的增量兼容逻辑
- 更新白色模式样式

## Unread / Uncertain Areas

- `zread.ai` 本轮不可用，未获得其摘要视图。
- 未读远端 GitHub issues / discussions；当前任务不依赖社区反馈。

## Confidence

高。核心链路已经通过本地源码和线上真实返回内容交叉验证。
