# 重点开发/收藏卡片特效 + 列表对齐 + 编辑控件重设计

## 背景

上一次会话在实现「重点开发(pinned)/收藏(favorite)标记展示」的过程中崩溃,留下了未完成的改动:

- `src/components/ProjectCard.tsx` 已经加了 `card--pinned` / `card--favorite` 类名、`--pin-c` / `--fav-c` CSS 变量、以及 pinned/favorite 的 `mini-badge`,但依赖的 `tagColors` prop 在 `src/App.tsx` 渲染 `<ProjectCard>` 时没有传入,会导致类型报错。
- `styles.css` 里没有定义 `.card--pinned` / `.card--favorite` 的任何样式,所以徽章之外没有"特殊效果"。
- 列表视图 `src/components/ProjectRow.tsx` 完全没有 pinned/favorite 的展示,且 `.row` 用纯 flex 布局,各行的状态徽章、标签区宽度不固定,导致进度条等列没法纵向对齐。

本次目标:修复崩溃点、补齐 pinned/favorite 的视觉设计、让列表视图纵向对齐、把编辑弹窗里的勾选控件改造成更有区分度的图标按钮,并将版本号升级到 0.1.4。

## 范围

- `src/components/ProjectCard.tsx`(网格卡片视图)
- `src/components/ProjectRow.tsx`(列表行视图)
- `src/components/Editor.tsx`(编辑项目弹窗)
- `src/App.tsx`(修复 prop 传递、传给 ProjectRow 需要的 tagColors)
- `src/styles.css`(新增/调整样式)
- `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json`(版本号 0.1.3 → 0.1.4)

不在范围内:不引入新的状态存储、不改动 pinned/favorite 的数据模型(`Project.pinned` / `Project.favorite` 已存在)、不改动 `useTagColors` 的持久化逻辑。

## 设计

### 1. 卡片特效(网格视图)

- **重点开发(pinned)**:卡片描边(`border-color`)替换为 `tagColors.pinned`,并叠加同色柔和 `box-shadow` 光晕(常态较弱,`:hover` 时增强,与现有 `.card:hover` 的 `transform`/`box-shadow` 过渡协调,不冲突覆盖)。用 `color-mix(in srgb, var(--pin-c) X%, transparent)` 生成光晕颜色,避免在深色/浅色主题下写死透明度数值不一致。
- **收藏(favorite)**:不做描边/光晕,沿用现有 `card-head` 右侧 `badge-group` 的位置(不做绝对定位角标,避免遮挡/重叠其他元素),但视觉权重比现有 `.mini-badge` 更高——实心 `tagColors.favorite` 底色、★ 图标 + 文字、轻微投影,和其余细描边徽章明显不同。
- **重点开发不再重复显示 mini-badge**:描边+光晕已经足够传达"重点"信息,`card-head` 里不再渲染 pinned 的文字徽章,避免信息冗余;若同时 favorite 为真,则 `badge-group` 里只会看到 favorite 徽章。
- 两者都为真时:重点的描边/光晕与收藏的徽章同时呈现,不做互斥或颜色混合处理。
- 需要分别在 `:root[data-theme="dark"]` 和 `:root[data-theme="light"]` 下核对对比度和视觉强度,不能出现光晕在浅色主题下过淡或深色主题下过曝。

### 2. 列表视图对齐 + 标记

- `.row` 从 `display: flex` 改为 `display: grid`,列定义大致为:状态徽章(固定宽) / 标题+描述(自适应但对齐基线固定) / 标签区(固定宽或 `minmax`) / 进度条(固定宽,靠右对齐) / 操作按钮(固定宽)。目标是让所有行的进度条、操作按钮在同一条竖线上对齐。
- pinned:整行左侧加 4px 色条(`tagColors.pinned`),标题前加小图标 📌。
- favorite:标题前加小图标 ★(`tagColors.favorite` 着色),不额外加色条(与卡片视图"重点=边框类效果、收藏=徽章类效果"的设计语言保持一致,列表里对应"重点=色条、收藏=图标")。
- `ProjectRow` 需要新增 `tagColors: TagColors` prop(与 `ProjectCard` 保持一致的接口),由 `App.tsx` 传入 `tagColors.colors`。

### 3. 编辑弹窗选择控件

- `Editor.tsx` 中原本两个 `.field.checkbox`(重点开发/收藏)替换为两个独立的图标 toggle 按钮:
  - 📌 图钉按钮:选中态描边高亮,颜色取 `tagColors.pinned`(与卡片描边呼应)。
  - ★ 星星按钮:选中态实心高亮,颜色取 `tagColors.favorite`(与卡片/列表的收藏图标呼应)。
- 需要给 `Editor` 组件新增 `tagColors: TagColors` prop,由 `App.tsx` 传入。
- 两个按钮各自独立可点击切换,不互斥。

### 4. 修复现有崩溃点

- `App.tsx` 渲染 `<ProjectCard>` 补上 `tagColors={tagColors.colors}`。
- `App.tsx` 渲染 `<ProjectRow>`、`<Editor>` 同步补上 `tagColors={tagColors.colors}`(见上两节新增的 prop 需求)。

### 5. 版本号

- `package.json`、`src-tauri/Cargo.toml`(`[package] version`)、`src-tauri/tauri.conf.json`(`version` 字段)三处从 `0.1.3` 改为 `0.1.4`。

## 验证

- `tsc`(通过 `npm run build` 或单独 `tsc --noEmit`)确认类型检查通过,不再有 prop 缺失报错。
- 用 `npm run dev` 启动,手动检查:
  - 网格视图下,pinned/favorite/两者都选/两者都不选 四种组合的卡片视觉效果。
  - 切换深色/浅色主题,确认效果对比度正常。
  - 列表视图下,不同标题长度、不同标签数量的项目,进度条等列是否纵向对齐。
  - 编辑弹窗里点击图钉/星星按钮能正确切换状态并保存。
