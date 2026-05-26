## IA

- 首页：考试信息 + 课程索引
- 课程索引页：单科所有课次
- 课程详情页：左栏课次切换 + 右栏正文 / clear / 图文内容

## Components

- 顶栏导航
- 首页 subject cards
- 课程索引 archive list
- 详情页 note rail
- clear panel
- figure / figcaption
- 代码块 / 表格 / blockquote / admonition

## Visual Direction

- 主方向：浅底学术纸面
- 不走纯白空板，而是暖白底 + 浅米灰 panel + 单层细网格背景
- 标题继续保留衬线风格，正文改成更清晰的深色文本
- 强调色保留暖金 / 铜色系，但饱和度降低，避免在亮底上刺眼

## Background System

- `body::before`
  - 一层超浅色 grid
  - 两团很淡的暖色径向光斑
- `body::after`
  - 仅保留极轻的顶部光感，不再做深色遮罩

## State Notes

- 首页与索引页需要可读性更强的浅色 card 边界
- 左栏改成浮动卡片，不再贴边整列铺满
- 收起左栏状态在浅色模式下也要保留交互可见性

## Accessibility

- 正文与背景对比度优先
- 链接与强调色不能只靠颜色区分
- 表格、代码块、warning 区块都需要足够边界

## Artifact Plan

- 本地构建后抽样看：
  - 首页
  - `互换/0514`
  - `大物/0513`
  - `安全学原理/0519`
