## Implementation Steps

1. 新增 `scripts/build-course-stage-source.mjs`
   - 拉取线上 sitemap
   - 抓取线上旧页 `index.md` / `clear.md`
   - 反解成 staging source 下的 `_with_ima.md` / `-clear.md`
   - 把本地新增完成页转换并并入 staging source
2. 修改 `scripts/build-course-recordings.mjs`
   - 新增 `安原`
   - 调整 alt / caption 优先级
   - 为远程图片记录图片引用，保证基线页元信息完整
   - 切换为白色主题 token
3. 修改 `scripts/md-renderer.mjs`
   - 同步简化版白色主题
4. 修改 `package.json`
   - 增加 staging build 脚本
   - 修正课程站 deploy 顺序，避免发布旧产物
5. 本地构建验证
6. 发布并做线上回归

## Key Paths

- repo: `/Users/a123/Desktop/Obsidian-blog/99-临时/courses_webui`
- local notes: `/Users/a123/Desktop/Obsidian-blog/03-领域/课程录音`
- stage root: `tmp/course-source-stage`

## Verification Plan

- 构建前打印增量课次列表
- 构建后抽样比对：
  - 一个旧页
  - 三个新增页
  - 首页课程计数
- 发布后抓线上页面确认
