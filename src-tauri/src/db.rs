use crate::models::{Project, ProjectInput, SageEntry, SageEntryInput};
use rusqlite::{params, Connection, Row};
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

fn row_to_project(row: &Row) -> rusqlite::Result<Project> {
    let tech_raw: String = row.get("tech_stack")?;
    let tech_stack: Vec<String> = serde_json::from_str(&tech_raw).unwrap_or_default();
    Ok(Project {
        id: row.get("id")?,
        name: row.get("name")?,
        folder: row.get("folder")?,
        description: row.get("description")?,
        tech_stack,
        status: row.get("status")?,
        deployed: row.get::<_, i64>("deployed")? != 0,
        deploy_method: row.get("deploy_method")?,
        open_source: row.get::<_, i64>("open_source")? != 0,
        pinned: row.get::<_, i64>("pinned")? != 0,
        favorite: row.get::<_, i64>("favorite")? != 0,
        url: row.get("url")?,
        repo: row.get("repo")?,
        notes: row.get("notes")?,
        progress: row.get("progress")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

pub fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         CREATE TABLE IF NOT EXISTS projects (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            folder        TEXT NOT NULL DEFAULT '',
            description   TEXT NOT NULL DEFAULT '',
            tech_stack    TEXT NOT NULL DEFAULT '[]',
            status        TEXT NOT NULL DEFAULT 'active',
            deployed      INTEGER NOT NULL DEFAULT 0,
            deploy_method TEXT NOT NULL DEFAULT '',
            url           TEXT NOT NULL DEFAULT '',
            repo          TEXT NOT NULL DEFAULT '',
            notes         TEXT NOT NULL DEFAULT '',
            progress      INTEGER NOT NULL DEFAULT 0,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
         );",
    )?;
    let has_open_source: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name='open_source'")?
        .exists([])?;
    if !has_open_source {
        conn.execute_batch("ALTER TABLE projects ADD COLUMN open_source INTEGER NOT NULL DEFAULT 0;")?;
    }
    let has_pinned: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name='pinned'")?
        .exists([])?;
    if !has_pinned {
        conn.execute_batch("ALTER TABLE projects ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;")?;
    }
    let has_favorite: bool = conn
        .prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name='favorite'")?
        .exists([])?;
    if !has_favorite {
        conn.execute_batch("ALTER TABLE projects ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;")?;
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sage_entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id    INTEGER NOT NULL,
            where_stopped TEXT NOT NULL DEFAULT '',
            next_steps    TEXT NOT NULL DEFAULT '',
            quadrant      TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
         );",
    )?;
    Ok(())
}

pub fn list(conn: &Connection) -> rusqlite::Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT * FROM projects ORDER BY \
         CASE status WHEN 'active' THEN 0 WHEN 'paused' THEN 1 \
         WHEN 'idea' THEN 2 WHEN 'done' THEN 3 ELSE 4 END, updated_at DESC",
    )?;
    let rows = stmt.query_map([], row_to_project)?;
    rows.collect()
}

pub fn create(conn: &Connection, p: &ProjectInput) -> rusqlite::Result<Project> {
    let tech = serde_json::to_string(&p.tech_stack).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "INSERT INTO projects (name, folder, description, tech_stack, status, deployed, deploy_method, open_source, pinned, favorite, url, repo, notes, progress)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14)",
        params![p.name, p.folder, p.description, tech, p.status, p.deployed as i64, p.deploy_method, p.open_source as i64, p.pinned as i64, p.favorite as i64, p.url, p.repo, p.notes, p.progress],
    )?;
    let id = conn.last_insert_rowid();
    get(conn, id)
}

pub fn update(conn: &Connection, id: i64, p: &ProjectInput) -> rusqlite::Result<Project> {
    let tech = serde_json::to_string(&p.tech_stack).unwrap_or_else(|_| "[]".into());
    conn.execute(
        "UPDATE projects SET name=?1, folder=?2, description=?3, tech_stack=?4, status=?5,
         deployed=?6, deploy_method=?7, open_source=?8, pinned=?9, favorite=?10, url=?11, repo=?12, notes=?13, progress=?14,
         updated_at=datetime('now') WHERE id=?15",
        params![p.name, p.folder, p.description, tech, p.status, p.deployed as i64, p.deploy_method, p.open_source as i64, p.pinned as i64, p.favorite as i64, p.url, p.repo, p.notes, p.progress, id],
    )?;
    get(conn, id)
}

pub fn get(conn: &Connection, id: i64) -> rusqlite::Result<Project> {
    conn.query_row("SELECT * FROM projects WHERE id=?1", params![id], row_to_project)
}

pub fn delete(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM projects WHERE id=?1", params![id])?;
    Ok(())
}

fn row_to_sage(row: &Row) -> rusqlite::Result<SageEntry> {
    Ok(SageEntry {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        where_stopped: row.get("where_stopped")?,
        next_steps: row.get("next_steps")?,
        quadrant: row.get("quadrant")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        project_name: None,
    })
}

pub fn list_sage_entries(conn: &Connection) -> rusqlite::Result<Vec<SageEntry>> {
    let mut stmt = conn.prepare(
        "SELECT s.*, p.name as project_name FROM sage_entries s \
         LEFT JOIN projects p ON s.project_id = p.id \
         ORDER BY s.updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let mut e = row_to_sage(row)?;
        e.project_name = row.get("project_name")?;
        Ok(e)
    })?;
    rows.collect()
}

#[allow(dead_code)]
pub fn list_sage_entries_by_project(
    conn: &Connection,
    project_id: i64,
) -> rusqlite::Result<Vec<SageEntry>> {
    let mut stmt = conn.prepare(
        "SELECT s.*, p.name as project_name FROM sage_entries s \
         LEFT JOIN projects p ON s.project_id = p.id \
         WHERE s.project_id = ?1 \
         ORDER BY s.updated_at DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |row| {
        let mut e = row_to_sage(row)?;
        e.project_name = row.get("project_name")?;
        Ok(e)
    })?;
    rows.collect()
}

pub fn create_sage_entry(conn: &Connection, input: &SageEntryInput) -> rusqlite::Result<SageEntry> {
    conn.execute(
        "INSERT INTO sage_entries (project_id, where_stopped, next_steps, quadrant) \
         VALUES (?1, ?2, ?3, ?4)",
        params![input.project_id, input.where_stopped, input.next_steps, input.quadrant],
    )?;
    let id = conn.last_insert_rowid();
    get_sage_entry(conn, id)
}

pub fn update_sage_entry(
    conn: &Connection,
    id: i64,
    input: &SageEntryInput,
) -> rusqlite::Result<SageEntry> {
    conn.execute(
        "UPDATE sage_entries SET project_id=?1, where_stopped=?2, next_steps=?3, quadrant=?4, \
         updated_at=datetime('now') WHERE id=?5",
        params![input.project_id, input.where_stopped, input.next_steps, input.quadrant, id],
    )?;
    get_sage_entry(conn, id)
}

pub fn get_sage_entry(conn: &Connection, id: i64) -> rusqlite::Result<SageEntry> {
    conn.query_row(
        "SELECT s.*, p.name as project_name FROM sage_entries s \
         LEFT JOIN projects p ON s.project_id = p.id \
         WHERE s.id=?1",
        params![id],
        |row| {
            let mut e = row_to_sage(row)?;
            e.project_name = row.get("project_name")?;
            Ok(e)
        },
    )
}

pub fn delete_sage_entry(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM sage_entries WHERE id=?1", params![id])?;
    Ok(())
}
