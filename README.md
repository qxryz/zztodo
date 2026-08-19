## 功能

- **项目卡片**：项目名、定位、技术栈标签、状态、进度条、是否上线、部署方式、线上/仓库地址、备注
- **自动探测**：选择本地文件夹后，自动识别技术栈（Node/React/Next/Rust/Go/Python/Docker…）并读取 git remote
- **快捷操作**：一键在 Finder / 文件资源管理器中打开文件夹、访问线上地址
- **状态筛选 + 搜索**：按状态 / 重点 / 收藏过滤，按名称 / 描述 / 技术栈搜索
- **贤者时间**：记录项目停在哪里、下一步做什么，并按优先级四象限整理
- **zzkey**：离线管理你的api key，多重加密方式，可优雅分类，记录密钥信息，用处，与zztodo项目绑定，强迫症大友好；粘性标记可为新建条目染上浅色标记
- **菜单栏 / 系统托盘快捷栏**：macOS 顶部状态栏或 Windows 系统托盘图标；固定「网站 / 文件夹」二级菜单；可自定义重点项目入口、明文草稿 Key、锁定库、随机打开进行中项目等
- **多套主题**：明亮 / 暗夜 / 奶咖 / 薄荷 / 樱花 / 海洋 / 石墨 / 跟随系统
- **本地存储**：项目数据使用 SQLite，Key 库加密保存在本机；无账号、无云端、无追踪

## 技术栈

- [Tauri 2](https://tauri.app/) — 原生 macOS（Apple Silicon）/ Windows x64 桌面外壳
- Rust + [rusqlite](https://github.com/rusqlite/rusqlite)（bundled SQLite）
- React 19 + TypeScript + Vite
- 纯手写 CSS 设计系统（含多套明暗主题）

## 开发

```bash
pnpm install
pnpm tauri dev                                            # 开发模式
pnpm tauri build --config src-tauri/tauri.ci.conf.json    # 打包当前平台
```

本地数据位置：

- macOS：`~/Library/Application Support/com.zztodo.desktop/`
- Windows：`%LOCALAPPDATA%\com.zztodo.desktop\`

## 数据模型

### projects

| 字段 | 说明 |
|------|------|
| id | 项目 ID |
| name | 项目名 |
| folder | 本地文件夹绝对路径 |
| description | 项目定位 |
| tech_stack | 技术栈标签数组 |
| status | idea / active / paused / done / archived |
| deployed | 是否已上线 |
| deploy_method | 部署方式（Vercel / VPS / App Store…） |
| open_source | 是否已开源 |
| pinned | 是否重点开发 |
| favorite | 是否收藏 |
| url | 线上地址 |
| repo | 仓库地址 |
| notes | 备注 |
| progress | 完成度 0–100 |
| created_at | 创建时间 |
| updated_at | 更新时间 |

### sage_entries

| 字段 | 说明 |
|------|------|
| id | 记录 ID |
| project_id | 关联项目 ID |
| where_stopped | 当前停在哪里 |
| next_steps | 下一步计划 |
| quadrant | 优先级象限（q1 / q2 / q3 / q4） |
| created_at | 创建时间 |
| updated_at | 更新时间 |

zzkey 数据保存在独立的加密 vault 中，不写入 SQLite。

## License

MIT
