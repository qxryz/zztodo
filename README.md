## 功能

- **项目卡片**：项目名、定位、技术栈标签、状态、进度条、是否上线、部署方式、线上/仓库地址、备注
- **自动探测**：选择本地文件夹后，自动识别技术栈（Node/React/Next/Rust/Go/Python/Docker…）并读取 git remote
- **快捷操作**：一键在 Finder 打开文件夹、访问线上地址
- **状态筛选 + 搜索**：按状态过滤，按名称 / 描述 / 技术栈搜索
- **zzkey**：离线管理你的api key，多重加密方式，可优雅分类，记录密钥信息，用处，与zztodo项目绑定，强迫症大友好
- **三套主题**：亮色 / 暗色 / 跟随系统
- **本地存储**：SQLite，无账号、无云端、无追踪

## 技术栈

- [Tauri 2](https://tauri.app/) — 原生 macOS 外壳
- Rust + [rusqlite](https://github.com/rusqlite/rusqlite)（bundled SQLite）
- React 19 + TypeScript + Vite
- 纯手写 CSS 设计系统（含亮/暗/系统三主题）

## 开发

```bash
pnpm install
pnpm tauri dev      # 开发模式
pnpm tauri build    # 打包 .app / .dmg
```

数据库位置：`~/Library/Application Support/com.zztodo.app/zztodo.db`

## 数据模型

| 字段 | 说明 |
|------|------|
| name | 项目名 |
| folder | 本地文件夹绝对路径 |
| description | 项目定位 |
| tech_stack | 技术栈标签数组 |
| status | idea / active / paused / done / archived |
| deployed | 是否已上线 |
| deploy_method | 部署方式（Vercel / VPS / App Store…） |
| url | 线上地址 |
| repo | 仓库地址 |
| progress | 完成度 0–100 |
| notes | 备注 |

## License

MIT
