## Decision

ADAPT

- 复用现有 `courses_webui` 生成器和 Cloudflare 发布链路。
- 新增最小胶水脚本，把线上稳定页反解成 staging source，并把本地新增完成页转换成生成器现有输入格式。
- 不另起一套新站生成器，不手搓第二套部署方案。

## Sources Checked

1. `~/.codex/memory/map.json`
2. 本地技能：
   - `find-skills`
   - `web-search-research`
   - `problem-solving-brief`
   - `design-first`
   - `open-design-mode`
3. 本地仓库：
   - `README.md`
   - `package.json`
   - `scripts/build-course-recordings.mjs`
   - `scripts/build-course-domain.mjs`
   - `scripts/md-renderer.mjs`
4. 线上站点：
   - `https://courses.20060618.xyz/`
   - `https://courses.20060618.xyz/course-sitemap.xml`
   - 代表性 `index.md` / `clear.md`
5. 上游仓库：
   - `https://github.com/sudo-yf/courses_webui`
   - `https://zread.ai/sudo-yf/courses_webui` 已尝试，但本轮未返回可用结果

## Skill Selection

| skill | trigger | mandatory | reason | next action |
| --- | --- | --- | --- | --- |
| `find-skills` | 非 trivial 站点改造 + 发布 | 是 | 当前任务跨文档、构建脚本、部署，需先锁定技能面 | 已执行，选择当前最小技能集合 |
| `web-search-research` | 线上站点与 GitHub 仓库是当前事实源 | 是 | 需要确认 live sitemap、线上镜像 Markdown 结构与远端仓库身份 | 已执行，改动基于线上与仓库当前状态 |
| `problem-solving-brief` | 旧页不能动，新页要增量上 | 是 | 需要先写清“基线 + 增量”的问题定义 | 已执行，更新 `docs/problem-brief.md` |
| `design-first` | 白色模式属于前端视觉变更 | 是 | 需要先确定主题方向、信息层级和背景纹理 | 已执行，更新 `docs/design.md` |
| `open-design-mode` | 本地先验证白色主题再上线 | 是 | 强制本地构建与自检，不直接热改线上 | 构建后执行本地预览与抽样验证 |

## Why Not Build A New Pipeline

- 现有生成器已经覆盖课程页、Markdown 镜像、sitemap 和部署目录。
- 需求核心是“保住旧页 + 并入新页”，不是重做站点架构。
- 重新造轮子只会扩大覆盖风险。

## Self-Built Boundary

- 新增一个 staging source 构建脚本。
- 小幅增强课程生成器：
  - 支持 `安原 / 安全学原理`
  - 修复图片 alt/caption 选择逻辑
  - 记录远程图片元信息
- 改白色主题 token 与背景纹理。

## Risks

- 线上 `index.md` / `clear.md` 是镜像格式，必须反解掉站点包裹层，不能直接回灌。
- 当前工作树有用户未提交改动，编辑时必须只动目标文件。
- 若部署脚本仍使用旧构建顺序，可能把旧产物带上去。

## Test And Rollback Plan

- 先在 staging source 上本地构建，不直接部署。
- 抽样比对旧页和新增页。
- 若 staging 反解不正确，先修脚本再重建，不触碰线上。
- 发布仅在本地验证通过后进行。
