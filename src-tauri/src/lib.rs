mod db;
mod models;
mod scan;
mod tray;
mod vault;
mod vault_commands;

use db::Db;
use models::{FolderScan, Project, ProjectInput};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};
use vault_commands::VaultState;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
fn list_projects(db: State<Db>) -> Result<Vec<Project>, String> {
    let conn = db.0.lock().map_err(err)?;
    db::list(&conn).map_err(err)
}

#[tauri::command]
fn create_project(
    app: tauri::AppHandle,
    db: State<Db>,
    input: ProjectInput,
) -> Result<Project, String> {
    let conn = db.0.lock().map_err(err)?;
    let p = db::create(&conn, &input).map_err(err)?;
    drop(conn);
    let _ = tray::rebuild_tray(&app);
    Ok(p)
}

#[tauri::command]
fn update_project(
    app: tauri::AppHandle,
    db: State<Db>,
    id: i64,
    input: ProjectInput,
) -> Result<Project, String> {
    let conn = db.0.lock().map_err(err)?;
    let p = db::update(&conn, id, &input).map_err(err)?;
    drop(conn);
    let _ = tray::rebuild_tray(&app);
    Ok(p)
}

#[tauri::command]
fn delete_project(app: tauri::AppHandle, db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(err)?;
    db::delete(&conn, id).map_err(err)?;
    drop(conn);
    let _ = tray::rebuild_tray(&app);
    Ok(())
}

#[tauri::command]
fn scan_folder(folder: String) -> Result<FolderScan, String> {
    Ok(scan::scan_folder(&folder))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = Connection::open(dir.join("zztodo.db")).expect("open db");
            db::init(&conn).expect("init db");
            app.manage(Db(Mutex::new(conn)));
            app.manage(VaultState::new(dir.join("keys.vault")));
            app.manage(tray::TrayState::load(dir.join("tray_config.json")));
            if let Err(e) = tray::init_tray(app.handle()) {
                eprintln!("[tray] init failed: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            update_project,
            delete_project,
            scan_folder,
            tray::tray_get_config,
            tray::tray_set_config,
            tray::tray_rebuild,
            vault_commands::vault_status,
            vault_commands::vault_create,
            vault_commands::vault_unlock,
            vault_commands::vault_lock,
            vault_commands::vault_destroy,
            vault_commands::vault_change_password,
            vault_commands::vault_list_entries,
            vault_commands::vault_get_secret,
            vault_commands::vault_save_entry,
            vault_commands::vault_delete_entry,
            vault_commands::vault_reset_entry_colors,
            vault_commands::vault_add_attachment,
            vault_commands::vault_save_attachment_to,
            vault_commands::vault_remove_attachment,
            vault_commands::vault_list_providers,
            vault_commands::vault_save_provider,
            vault_commands::vault_delete_provider,
            vault_commands::vault_fetch_models
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
