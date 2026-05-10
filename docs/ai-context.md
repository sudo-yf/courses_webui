# Goal
在 `sudo-yf/courses_webui` 中独立管理课程站前端版本，支持响应式布局和每篇笔记对应 clear 原文的一键显示/隐藏。

# Non-goals
不修改 Obsidian 源笔记；不把 Tailwind 接进静态生成器；不在 `sudo-yf.github.io` 中提交本次版本管理。

# Key facts
- 目标仓库初始为空。
- 数据源默认从相邻仓库 `../sudo-yf.github.io/blog/03-领域/课程录音` 读取。
- 输出目录：`public/courses`、`public/course-assets`、`dist-course-site`。
- 部署配置：`wrangler.toml`。

# Decisions
- 使用原生 HTML/CSS 和 `<details>` 实现 clear 抽屉，无 JS 依赖。
- `????-clear.md` 优先，缺失时兜底 `????-manual-cleaned.md`。
- 缺失 clear 的课次显示“暂无对应 clear 原文”。

# Validation status
- done: `npm install` completed with 0 vulnerabilities.
- done: `npm run build` generated 63 notes and 1143 image references.
- done: generated pages include clear panels, clear links, and `clear.md` mirrors when source exists.
- done: Playwright local checks passed for desktop/mobile clear open-close behavior, missing-clear fallback, no horizontal overflow, no console errors.


# Update 2026-05-10
- Exam metadata now comes from `00-总览/考试 DDL数据/*.md` frontmatter.
- Homepage renders `XX.x Days / MM-DD HH:mm-HH:mm / 学分 / N class`.
- Remaining days are recalculated in the browser every minute.
- Verified online homepage after deploy version `34c84bee-2b84-4363-b4d1-b992d189a805`.
