use crate::models::FolderScan;
use std::path::Path;
use std::process::Command;

/// Detect tech stack and git remote by inspecting well-known marker files.
pub fn scan_folder(folder: &str) -> FolderScan {
    let path = Path::new(folder);
    let mut scan = FolderScan::default();

    if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
        scan.suggested_name = name.to_string();
    }
    if !path.is_dir() {
        return scan;
    }

    let exists = |f: &str| path.join(f).exists();
    let mut tech: Vec<String> = Vec::new();
    let add = |t: &str, list: &mut Vec<String>| {
        if !list.iter().any(|x| x == t) {
            list.push(t.to_string());
        }
    };

    // JS / TS ecosystem
    if exists("package.json") {
        add("Node.js", &mut tech);
        if let Ok(content) = std::fs::read_to_string(path.join("package.json")) {
            for (dep, label) in [
                ("\"next\"", "Next.js"),
                ("react", "React"),
                ("vue", "Vue"),
                ("svelte", "Svelte"),
                ("@tauri-apps", "Tauri"),
                ("express", "Express"),
                ("typescript", "TypeScript"),
                ("vite", "Vite"),
                ("tailwindcss", "Tailwind"),
            ] {
                if content.contains(dep) {
                    add(label, &mut tech);
                }
            }
        }
    }
    if exists("tsconfig.json") {
        add("TypeScript", &mut tech);
    }
    if exists("Cargo.toml") {
        add("Rust", &mut tech);
    }
    if exists("go.mod") {
        add("Go", &mut tech);
    }
    if exists("requirements.txt") || exists("pyproject.toml") || exists("Pipfile") {
        add("Python", &mut tech);
    }
    if exists("Gemfile") {
        add("Ruby", &mut tech);
    }
    if exists("pom.xml") || exists("build.gradle") {
        add("Java", &mut tech);
    }
    if exists("Dockerfile") || exists("docker-compose.yml") {
        add("Docker", &mut tech);
    }
    if exists("pubspec.yaml") {
        add("Flutter", &mut tech);
    }
    scan.tech_stack = tech;

    // git remote
    if path.join(".git").exists() {
        if let Ok(out) = Command::new("git")
            .args(["-C", folder, "remote", "get-url", "origin"])
            .output()
        {
            if out.status.success() {
                scan.repo = String::from_utf8_lossy(&out.stdout).trim().to_string();
            }
        }
    }

    scan
}
