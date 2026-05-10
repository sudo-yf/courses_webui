# courses_webui

独立的课程笔记静态站生成器。

## 功能

- 从 Obsidian 课程录音目录读取 `*_with_ima.md`。
- 复制课件图片到公开资源目录。
- 为每篇笔记生成 HTML 和 Markdown 镜像。
- 在笔记页内一键展开/收起对应 `clear` 原文。
- 生成 `llms.txt`、`llms-full.txt`、`course-sitemap.xml`、`robots.txt` 和 Cloudflare `_headers`。

## 数据源

默认读取：

```txt
../sudo-yf.github.io/blog/03-领域/课程录音
```

可通过环境变量覆盖：

```sh
COURSE_SOURCE_ROOT=/path/to/课程录音 npm run build
```

## 本地运行

```sh
npm install
npm run build
npm run dev
```

## 部署

```sh
npm run deploy
```

默认域名：`https://courses.20060618.xyz`。
