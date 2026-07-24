mod db;
mod models;
mod scan;

use db::Db;
use models::{FolderScan, Project, ProjectInput};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{Manager, State};

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

#[tauri::command]
fn list_projects(db: State<Db>) -> Result<Vec<Project>, String> {
    let conn = db.0.lock().map_err(err)?;
    db::list(&conn).map_err(err)
}

#[tauri::command]
fn create_project(db: State<Db>, input: ProjectInput) -> Result<Project, String> {
    let conn = db.0.lock().map_err(err)?;
    db::create(&conn, &input).map_err(err)
}

#[tauri::command]
fn update_project(db: State<Db>, id: i64, input: ProjectInput) -> Result<Project, String> {
    let conn = db.0.lock().map_err(err)?;
    db::update(&conn, id, &input).map_err(err)
}

#[tauri::command]
fn delete_project(db: State<Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(err)?;
    db::delete(&conn, id).map_err(err)
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
        .setup(|app| {
            let dir = app.path().app_data_dir().expect("no app data dir");
            std::fs::create_dir_all(&dir).ok();
            let conn = Connection::open(dir.join("zztodo.db")).expect("open db");
            db::init(&conn).expect("init db");
            app.manage(Db(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_projects,
            create_project,
            update_project,
            delete_project,
            scan_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
