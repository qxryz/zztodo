//! macOS menu-bar (status item) for zztodo.
//!
//! Always shows 网站 / 文件夹 submenus of every project that has a URL or
//! folder. Extra items (重点项目快捷入口、草稿 key、显示窗口、锁定库…) are
//! editable from Settings → 快捷栏 and stored as plain JSON next to the DB.

use crate::db;
use crate::models::Project;
use crate::vault_commands::VaultState;
use crate::Db;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

const TRAY_ID: &str = "main";

// ─── config ──────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct DraftKey {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub model_id: String,
    #[serde(default)]
    pub docs_url: String,
    #[serde(default)]
    pub console_url: String,
}

/// User-editable extras that appear between the fixed 网站/文件夹 block and
/// the always-present footer (显示 / 退出).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum TrayExtra {
    /// 一级菜单 = 项目名；二级 = 仓库 / 网站 / 文件夹。
    PinnedProject { project_id: i64 },
    /// 明文草稿 key（长期临时用，不进 vault）。
    DraftKey { draft: DraftKey },
    /// 一键锁定 Key 库。
    LockVault,
    /// 统计条：N 个进行中 · M 个重点（只读，不可点）。
    StatusLine,
    /// 随机打开一个「进行中」项目的本地文件夹。
    RandomActiveFolder,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayConfig {
    /// When false the tray icon is removed entirely.
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub extras: Vec<TrayExtra>,
}

fn default_true() -> bool {
    true
}

impl Default for TrayConfig {
    fn default() -> Self {
        TrayConfig {
            enabled: true,
            extras: vec![
                TrayExtra::StatusLine,
                TrayExtra::LockVault,
            ],
        }
    }
}

pub struct TrayState {
    pub path: PathBuf,
    pub config: Mutex<TrayConfig>,
}

impl TrayState {
    pub fn load(path: PathBuf) -> Self {
        let config = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        TrayState {
            path,
            config: Mutex::new(config),
        }
    }

    fn save(&self, cfg: &TrayConfig) -> Result<(), String> {
        let bytes = serde_json::to_vec_pretty(cfg).map_err(|e| e.to_string())?;
        std::fs::write(&self.path, bytes).map_err(|e| e.to_string())
    }
}

// ─── public commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn tray_get_config(state: State<TrayState>) -> Result<TrayConfig, String> {
    Ok(state.config.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn tray_set_config(
    app: AppHandle,
    state: State<TrayState>,
    config: TrayConfig,
) -> Result<TrayConfig, String> {
    state.save(&config)?;
    *state.config.lock().map_err(|e| e.to_string())? = config.clone();
    rebuild_tray(&app)?;
    Ok(config)
}

/// Rebuild after project create/update/delete so 网站/文件夹 stay fresh.
#[tauri::command]
pub fn tray_rebuild(app: AppHandle) -> Result<(), String> {
    rebuild_tray(&app)
}

// ─── setup + rebuild ─────────────────────────────────────────────────────────

pub fn init_tray(app: &AppHandle) -> Result<(), String> {
    rebuild_tray(app)
}

pub fn rebuild_tray(app: &AppHandle) -> Result<(), String> {
    let tray_state = app.state::<TrayState>();
    let cfg = tray_state
        .config
        .lock()
        .map_err(|e| e.to_string())?
        .clone();

    // Tear down any previous icon first.
    if let Some(existing) = app.tray_by_id(TRAY_ID) {
        let _ = existing.set_visible(false);
        let _ = app.remove_tray_by_id(TRAY_ID);
    }

    if !cfg.enabled {
        return Ok(());
    }

    let projects = {
        let db = app.state::<Db>();
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        db::list(&conn).map_err(|e| e.to_string())?
    };

    let menu = build_menu(app, &cfg, &projects)?;
    let icon = tray_icon(app)?;

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("zztodo")
        .on_menu_event(|app, event| {
            if let Err(e) = handle_menu(app, event.id.as_ref()) {
                eprintln!("[tray] menu action failed: {e}");
            }
        });

    // Template image = monochrome, adapts to light/dark menu bar on macOS.
    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(true);

    builder.build(app).map_err(|e| e.to_string())?;
    Ok(())
}

fn tray_icon(_app: &AppHandle) -> Result<tauri::image::Image<'static>, String> {
    // Hand-rolled 22×22 template glyph (black on transparent). macOS treats
    // template images as monochrome masks that flip with the menu-bar theme.
    build_template_glyph()
}

fn build_template_glyph() -> Result<tauri::image::Image<'static>, String> {
    const W: u32 = 22;
    const H: u32 = 22;
    let mut rgba = vec![0u8; (W * H * 4) as usize];
    let mut put = |x: i32, y: i32| {
        if x >= 0 && y >= 0 && (x as u32) < W && (y as u32) < H {
            let i = ((y as u32 * W + x as u32) * 4) as usize;
            rgba[i] = 0;
            rgba[i + 1] = 0;
            rgba[i + 2] = 0;
            rgba[i + 3] = 255;
        }
    };
    // Rounded-ish card outline.
    for x in 4..18 {
        put(x, 3);
        put(x, 18);
    }
    for y in 3..19 {
        put(4, y);
        put(17, y);
    }
    // Three checklist rows.
    for &(y, x0, x1) in &[(8, 7, 15), (12, 7, 15), (16, 7, 15)] {
        for x in x0..x1 {
            put(x, y);
        }
    }
    Ok(tauri::image::Image::new_owned(rgba, W, H))
}

// ─── menu construction ───────────────────────────────────────────────────────

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    cfg: &TrayConfig,
    projects: &[Project],
) -> Result<Menu<R>, String> {
    let mut items: Vec<Box<dyn tauri::menu::IsMenuItem<R>>> = Vec::new();

    // ── fixed: 网站 ──
    let web_items = projects_with(|p| !p.url.trim().is_empty(), projects);
    items.push(Box::new(submenu_of(
        app,
        "web_root",
        "网站",
        &web_items,
        |p| format!("web:{}", p.id),
        web_items.is_empty(),
    )?));

    // ── fixed: 文件夹 ──
    let folder_items = projects_with(|p| !p.folder.trim().is_empty(), projects);
    items.push(Box::new(submenu_of(
        app,
        "folder_root",
        "文件夹",
        &folder_items,
        |p| format!("folder:{}", p.id),
        folder_items.is_empty(),
    )?));

    // ── user extras ──
    if !cfg.extras.is_empty() {
        items.push(Box::new(
            PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
        ));
    }

    for (i, extra) in cfg.extras.iter().enumerate() {
        match extra {
            TrayExtra::PinnedProject { project_id } => {
                let Some(p) = projects.iter().find(|p| p.id == *project_id) else {
                    // Stale id (project deleted) — skip silently.
                    continue;
                };
                let label = format!("★ {}", truncate(&p.name, 28));
                let mut kids: Vec<Box<dyn tauri::menu::IsMenuItem<R>>> = Vec::new();
                kids.push(Box::new(item(
                    app,
                    &format!("pin:{project_id}:repo"),
                    "打开仓库",
                    !p.repo.trim().is_empty(),
                )?));
                kids.push(Box::new(item(
                    app,
                    &format!("pin:{project_id}:url"),
                    "打开网站",
                    !p.url.trim().is_empty(),
                )?));
                kids.push(Box::new(item(
                    app,
                    &format!("pin:{project_id}:folder"),
                    "打开文件夹",
                    !p.folder.trim().is_empty(),
                )?));
                let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> =
                    kids.iter().map(|k| k.as_ref()).collect();
                items.push(Box::new(
                    Submenu::with_id_and_items(app, format!("pin_root:{i}"), label, true, &refs)
                        .map_err(|e| e.to_string())?,
                ));
            }
            TrayExtra::DraftKey { draft } => {
                let label = format!("🔑 {}", truncate(&draft.name, 24));
                let id = &draft.id;
                let mut kids: Vec<Box<dyn tauri::menu::IsMenuItem<R>>> = Vec::new();
                kids.push(Box::new(item(
                    app,
                    &format!("draft:{id}:key"),
                    "复制 API Key",
                    !draft.api_key.is_empty(),
                )?));
                kids.push(Box::new(item(
                    app,
                    &format!("draft:{id}:base"),
                    "复制 baseurl",
                    !draft.base_url.is_empty(),
                )?));
                kids.push(Box::new(item(
                    app,
                    &format!("draft:{id}:model"),
                    "复制模型 id",
                    !draft.model_id.is_empty(),
                )?));
                kids.push(Box::new(item(
                    app,
                    &format!("draft:{id}:all"),
                    "复制全家桶（env 格式）",
                    !draft.api_key.is_empty() || !draft.base_url.is_empty(),
                )?));
                kids.push(Box::new(
                    PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
                ));
                kids.push(Box::new(item(
                    app,
                    &format!("draft:{id}:docs"),
                    "打开文档站",
                    !draft.docs_url.is_empty(),
                )?));
                kids.push(Box::new(item(
                    app,
                    &format!("draft:{id}:console"),
                    "打开控制台",
                    !draft.console_url.is_empty(),
                )?));
                let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> =
                    kids.iter().map(|k| k.as_ref()).collect();
                items.push(Box::new(
                    Submenu::with_id_and_items(app, format!("draft_root:{i}"), label, true, &refs)
                        .map_err(|e| e.to_string())?,
                ));
            }
            TrayExtra::LockVault => {
                let unlocked = app
                    .try_state::<VaultState>()
                    .and_then(|s| s.inner.lock().ok().map(|g| g.is_some()))
                    .unwrap_or(false);
                items.push(Box::new(item(
                    app,
                    "lock_vault",
                    if unlocked {
                        "锁定 Key 库"
                    } else {
                        "锁定 Key 库（已锁定）"
                    },
                    unlocked,
                )?));
            }
            TrayExtra::StatusLine => {
                let active = projects.iter().filter(|p| p.status == "active").count();
                let pinned = projects.iter().filter(|p| p.pinned).count();
                let label = format!("进行中 {active} · 重点 {pinned} · 共 {}", projects.len());
                // Disabled item acts as a live status readout.
                items.push(Box::new(item(app, &format!("status:{i}"), &label, false)?));
            }
            TrayExtra::RandomActiveFolder => {
                let any = projects
                    .iter()
                    .any(|p| p.status == "active" && !p.folder.trim().is_empty());
                items.push(Box::new(item(
                    app,
                    "random_active_folder",
                    "🎲 随机打开进行中项目",
                    any,
                )?));
            }
        }
    }

    // ── footer ──
    items.push(Box::new(
        PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
    ));
    items.push(Box::new(item(app, "show", "显示 zztodo", true)?));
    items.push(Box::new(item(app, "quit", "退出", true)?));

    let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = items.iter().map(|i| i.as_ref()).collect();
    Menu::with_items(app, &refs).map_err(|e| e.to_string())
}

fn projects_with<'a>(
    pred: impl Fn(&Project) -> bool,
    projects: &'a [Project],
) -> Vec<&'a Project> {
    projects.iter().filter(|p| pred(p)).collect()
}

fn submenu_of<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    title: &str,
    projects: &[&Project],
    id_fn: impl Fn(&Project) -> String,
    empty: bool,
) -> Result<Submenu<R>, String> {
    if empty {
        let empty_item = item(app, &format!("{id}:empty"), "（暂无）", false)?;
        return Submenu::with_id_and_items(app, id, title, true, &[&empty_item])
            .map_err(|e| e.to_string());
    }
    let kids: Result<Vec<_>, String> = projects
        .iter()
        .map(|p| item(app, &id_fn(p), &truncate(&p.name, 40), true))
        .collect();
    let kids = kids?;
    let refs: Vec<&dyn tauri::menu::IsMenuItem<R>> = kids.iter().map(|k| k as _).collect();
    Submenu::with_id_and_items(app, id, title, true, &refs).map_err(|e| e.to_string())
}

fn item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    title: &str,
    enabled: bool,
) -> Result<MenuItem<R>, String> {
    MenuItem::with_id(app, id, title, enabled, None::<&str>).map_err(|e| e.to_string())
}

fn truncate(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        s.to_string()
    } else {
        let t: String = s.chars().take(max.saturating_sub(1)).collect();
        format!("{t}…")
    }
}

// ─── event handling ──────────────────────────────────────────────────────────

fn handle_menu(app: &AppHandle, id: &str) -> Result<(), String> {
    match id {
        "show" => {
            show_main(app)?;
            let _ = app.emit("tray://show", ());
        }
        "quit" => {
            app.exit(0);
        }
        "lock_vault" => {
            if let Some(state) = app.try_state::<VaultState>() {
                if let Ok(mut g) = state.inner.lock() {
                    *g = None;
                }
            }
            let _ = app.emit("tray://vault-locked", ());
            // Refresh label (锁定 → 已锁定).
            let _ = rebuild_tray(app);
        }
        "random_active_folder" => {
            let projects = {
                let db = app.state::<Db>();
                let conn = db.0.lock().map_err(|e| e.to_string())?;
                db::list(&conn).map_err(|e| e.to_string())?
            };
            let candidates: Vec<_> = projects
                .iter()
                .filter(|p| p.status == "active" && !p.folder.trim().is_empty())
                .collect();
            if candidates.is_empty() {
                return Ok(());
            }
            let idx = (std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos() as usize)
                .unwrap_or(0))
                % candidates.len();
            open_path(app, &candidates[idx].folder)?;
        }
        other => {
            if let Some(rest) = other.strip_prefix("web:") {
                let pid: i64 = rest.parse().map_err(|e| format!("{e}"))?;
                if let Some(url) = project_field(app, pid, |p| p.url.clone())? {
                    open_url(app, &url)?;
                }
            } else if let Some(rest) = other.strip_prefix("folder:") {
                let pid: i64 = rest.parse().map_err(|e| format!("{e}"))?;
                if let Some(path) = project_field(app, pid, |p| p.folder.clone())? {
                    open_path(app, &path)?;
                }
            } else if let Some(rest) = other.strip_prefix("pin:") {
                // pin:{id}:repo|url|folder
                let mut parts = rest.splitn(2, ':');
                let pid: i64 = parts
                    .next()
                    .unwrap_or("")
                    .parse()
                    .map_err(|e| format!("{e}"))?;
                let which = parts.next().unwrap_or("");
                match which {
                    "repo" => {
                        if let Some(u) = project_field(app, pid, |p| p.repo.clone())? {
                            open_url(app, &u)?;
                        }
                    }
                    "url" => {
                        if let Some(u) = project_field(app, pid, |p| p.url.clone())? {
                            open_url(app, &u)?;
                        }
                    }
                    "folder" => {
                        if let Some(p) = project_field(app, pid, |p| p.folder.clone())? {
                            open_path(app, &p)?;
                        }
                    }
                    _ => {}
                }
            } else if let Some(rest) = other.strip_prefix("draft:") {
                // draft:{id}:key|base|model|all|docs|console
                let mut parts = rest.splitn(2, ':');
                let draft_id = parts.next().unwrap_or("");
                let which = parts.next().unwrap_or("");
                let draft = {
                    let state = app.state::<TrayState>();
                    let cfg = state.config.lock().map_err(|e| e.to_string())?;
                    cfg.extras.iter().find_map(|e| match e {
                        TrayExtra::DraftKey { draft } if draft.id == draft_id => {
                            Some(draft.clone())
                        }
                        _ => None,
                    })
                };
                let Some(d) = draft else { return Ok(()) };
                match which {
                    "key" => write_clip(app, &d.api_key)?,
                    "base" => write_clip(app, &d.base_url)?,
                    "model" => write_clip(app, &d.model_id)?,
                    "all" => write_clip(app, &format_draft_env(&d))?,
                    "docs" if !d.docs_url.is_empty() => open_url(app, &d.docs_url)?,
                    "console" if !d.console_url.is_empty() => open_url(app, &d.console_url)?,
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

fn format_draft_env(d: &DraftKey) -> String {
    let mut lines = Vec::new();
    if !d.base_url.is_empty() {
        lines.push(format!("OPENAI_BASE_URL={}", d.base_url));
    }
    if !d.api_key.is_empty() {
        lines.push(format!("OPENAI_API_KEY={}", d.api_key));
    }
    if !d.model_id.is_empty() {
        lines.push(format!("OPENAI_MODEL={}", d.model_id));
    }
    lines.join("\n")
}

fn project_field(
    app: &AppHandle,
    id: i64,
    f: impl FnOnce(&Project) -> String,
) -> Result<Option<String>, String> {
    let db = app.state::<Db>();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let projects = db::list(&conn).map_err(|e| e.to_string())?;
    Ok(projects
        .iter()
        .find(|p| p.id == id)
        .map(f)
        .filter(|s| !s.trim().is_empty()))
}

fn show_main(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    Ok(())
}

fn open_url(app: &AppHandle, url: &str) -> Result<(), String> {
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

fn open_path(app: &AppHandle, path: &str) -> Result<(), String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

fn write_clip(app: &AppHandle, text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }
    app.clipboard()
        .write_text(text.to_string())
        .map_err(|e| e.to_string())
}
