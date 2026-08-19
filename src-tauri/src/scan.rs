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
        let mut command = Command::new("git");
        command.args(["-C", folder, "remote", "get-url", "origin"]);
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;

            // zztodo is a GUI-subsystem binary in release builds. Prevent the
            // console-subsystem git.exe child from flashing a terminal window
            // every time a project folder is scanned.
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }
        if let Ok(out) = command.output() {
            if out.status.success() {
                scan.repo = String::from_utf8_lossy(&out.stdout).trim().to_string();
            }
        }
    }

    scan
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMP_DIR: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new(label: &str) -> Self {
            let id = NEXT_TEMP_DIR.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir()
                .join(format!("zztodo-scan-{label}-{}-{id}", std::process::id()));
            std::fs::create_dir_all(&path).expect("create isolated scan test directory");
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn scan(path: &Path) -> FolderScan {
        scan_folder(path.to_str().expect("temporary path must be valid UTF-8"))
    }

    #[test]
    fn scans_native_paths_with_spaces_and_unicode() {
        // This becomes a drive-letter/backslash path when the test runs on
        // Windows, while still exercising shell-sensitive spaces everywhere.
        let root = TestDir::new("markers");
        let project = root.path().join("demo project 项目");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::write(
            project.join("package.json"),
            r#"{"dependencies":{"react":"latest","@tauri-apps/api":"latest"},"devDependencies":{"vite":"latest","typescript":"latest"}}"#,
        )
        .unwrap();
        std::fs::write(project.join("Cargo.toml"), "[package]\nname='demo'\n").unwrap();

        let result = scan(&project);

        assert_eq!(result.suggested_name, "demo project 项目");
        for expected in ["Node.js", "React", "Tauri", "TypeScript", "Vite", "Rust"] {
            assert!(
                result.tech_stack.iter().any(|item| item == expected),
                "missing {expected:?} in {:?}",
                result.tech_stack
            );
        }
    }

    #[test]
    fn reads_git_remote_when_repository_path_needs_no_shell_escaping() {
        if Command::new("git").arg("--version").output().is_err() {
            // Git is optional at runtime; scan_folder intentionally degrades to
            // an empty repo field when it is not installed.
            return;
        }

        let root = TestDir::new("git");
        let project = root.path().join("repo with spaces 仓库");
        std::fs::create_dir_all(&project).unwrap();
        let init = Command::new("git")
            .args(["-C"])
            .arg(&project)
            .args(["init", "--quiet"])
            .status()
            .unwrap();
        assert!(
            init.success(),
            "git init must succeed for the regression test"
        );

        let remote = "https://example.com/owner/windows-path-test.git";
        let add_remote = Command::new("git")
            .args(["-C"])
            .arg(&project)
            .args(["remote", "add", "origin", remote])
            .status()
            .unwrap();
        assert!(
            add_remote.success(),
            "adding the test remote must succeed for the regression test"
        );

        assert_eq!(scan(&project).repo, remote);
    }
}
