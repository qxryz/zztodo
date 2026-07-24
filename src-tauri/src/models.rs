use serde::{Deserialize, Serialize};

/// A tracked project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: i64,
    pub name: String,
    /// Absolute path to the local folder.
    pub folder: String,
    /// What the project is / its positioning.
    pub description: String,
    /// Comma-free list of tech-stack tags, stored as JSON array.
    pub tech_stack: Vec<String>,
    /// idea | active | paused | done | archived
    pub status: String,
    /// Whether it's deployed / live.
    pub deployed: bool,
    /// How it's deployed (e.g. Vercel, VPS, App Store...).
    pub deploy_method: String,
    /// Live URL, if any.
    pub url: String,
    /// Git remote / repository URL.
    pub repo: String,
    pub notes: String,
    /// 0-100 rough completion percentage.
    pub progress: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// Payload used when creating or updating a project.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectInput {
    pub name: String,
    pub folder: String,
    pub description: String,
    pub tech_stack: Vec<String>,
    pub status: String,
    pub deployed: bool,
    pub deploy_method: String,
    pub url: String,
    pub repo: String,
    pub notes: String,
    pub progress: i64,
}

/// Result of scanning a folder to auto-detect metadata.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FolderScan {
    pub suggested_name: String,
    pub tech_stack: Vec<String>,
    pub repo: String,
}
