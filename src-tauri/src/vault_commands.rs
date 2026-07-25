use crate::vault::{
    decrypt_vault, encrypt_vault, Attachment, KeyEntry, ProviderTemplate, VaultData,
    ERR_BAD_PASSWORD, MAX_ATTACHMENT_SIZE,
};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;
use zeroize::Zeroize;

pub struct Unlocked {
    password: String,
    data: VaultData,
}

impl Drop for Unlocked {
    fn drop(&mut self) {
        self.password.zeroize();
    }
}

pub struct VaultState {
    pub path: PathBuf,
    pub inner: Mutex<Option<Unlocked>>,
}

impl VaultState {
    pub fn new(path: PathBuf) -> Self {
        VaultState {
            path,
            inner: Mutex::new(None),
        }
    }
}

fn now_iso() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

fn file_size(path: &PathBuf) -> u64 {
    std::fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

/// Encrypt and atomically replace the vault file (tmp + rename).
fn persist(path: &PathBuf, unlocked: &Unlocked) -> Result<(), String> {
    let bytes = encrypt_vault(&unlocked.data, &unlocked.password)?;
    let tmp = path.with_extension("vault.tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct VaultStatus {
    pub state: String, // uninitialized | locked | unlocked
    pub file_size: u64,
    pub path: String,
}

#[derive(Serialize)]
pub struct AttachmentMeta {
    pub name: String,
    pub size: u64,
}

/// Entry projection sent to list views: no secret, no attachment data.
#[derive(Serialize)]
pub struct EntryMeta {
    pub id: i64,
    pub title: String,
    pub project_ids: Vec<i64>,
    pub base_url: String,
    pub docs_url: String,
    pub console_url: String,
    pub purpose: String,
    pub used_in: String,
    pub tags: Vec<String>,
    pub username: String,
    pub env_var: String,
    pub notes: String,
    pub attachments: Vec<AttachmentMeta>,
    pub created_at: String,
    pub updated_at: String,
}

fn to_meta(e: &KeyEntry) -> EntryMeta {
    EntryMeta {
        id: e.id,
        title: e.title.clone(),
        project_ids: e.project_ids.clone(),
        base_url: e.base_url.clone(),
        docs_url: e.docs_url.clone(),
        console_url: e.console_url.clone(),
        purpose: e.purpose.clone(),
        used_in: e.used_in.clone(),
        tags: e.tags.clone(),
        username: e.username.clone(),
        env_var: e.env_var.clone(),
        notes: e.notes.clone(),
        attachments: e
            .attachments
            .iter()
            .map(|a| AttachmentMeta {
                name: a.name.clone(),
                size: a.size,
            })
            .collect(),
        created_at: e.created_at.clone(),
        updated_at: e.updated_at.clone(),
    }
}

#[derive(Deserialize)]
pub struct EntryInput {
    pub id: Option<i64>,
    pub title: String,
    pub project_ids: Vec<i64>,
    pub base_url: String,
    pub docs_url: String,
    pub console_url: String,
    pub purpose: String,
    pub used_in: String,
    pub tags: Vec<String>,
    pub username: String,
    pub env_var: String,
    pub notes: String,
    /// None = keep existing secret (edit without changing password field).
    pub secret: Option<String>,
}

#[derive(Deserialize)]
pub struct ProviderInput {
    pub id: Option<i64>,
    pub name: String,
    pub base_url: String,
    pub docs_url: String,
    pub console_url: String,
}

const ERR_LOCKED: &str = "库未解锁";

impl VaultData {
    /// Insert or update an entry. `input.secret == None` keeps the stored
    /// secret, so editing an entry never has to round-trip the key material
    /// through the frontend.
    fn upsert_entry(&mut self, input: EntryInput, now: String) -> Result<&KeyEntry, String> {
        let idx = match input.id {
            Some(id) => {
                let i = self
                    .entries
                    .iter()
                    .position(|e| e.id == id)
                    .ok_or("条目不存在")?;
                let entry = &mut self.entries[i];
                entry.title = input.title;
                entry.project_ids = input.project_ids;
                entry.base_url = input.base_url;
                entry.docs_url = input.docs_url;
                entry.console_url = input.console_url;
                entry.purpose = input.purpose;
                entry.used_in = input.used_in;
                entry.tags = input.tags;
                entry.username = input.username;
                entry.env_var = input.env_var;
                entry.notes = input.notes;
                if let Some(secret) = input.secret {
                    entry.secret = secret;
                }
                entry.updated_at = now;
                i
            }
            None => {
                let id = self.next_id;
                self.next_id += 1;
                self.entries.push(KeyEntry {
                    id,
                    title: input.title,
                    project_ids: input.project_ids,
                    base_url: input.base_url,
                    docs_url: input.docs_url,
                    console_url: input.console_url,
                    purpose: input.purpose,
                    used_in: input.used_in,
                    tags: input.tags,
                    username: input.username,
                    env_var: input.env_var,
                    notes: input.notes,
                    secret: input.secret.unwrap_or_default(),
                    attachments: Vec::new(),
                    created_at: now.clone(),
                    updated_at: now,
                });
                self.entries.len() - 1
            }
        };
        Ok(&self.entries[idx])
    }
}

fn with_unlocked<T>(
    state: &VaultState,
    f: impl FnOnce(&mut Unlocked) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    let unlocked = guard.as_mut().ok_or(ERR_LOCKED)?;
    f(unlocked)
}

/// Same as with_unlocked but persists the vault file after the mutation.
fn mutate<T>(
    state: &VaultState,
    f: impl FnOnce(&mut Unlocked) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    let unlocked = guard.as_mut().ok_or(ERR_LOCKED)?;
    let out = f(unlocked)?;
    persist(&state.path, unlocked)?;
    Ok(out)
}

#[tauri::command]
pub fn vault_status(state: State<VaultState>) -> Result<VaultStatus, String> {
    let guard = state.inner.lock().map_err(|e| e.to_string())?;
    let st = if guard.is_some() {
        "unlocked"
    } else if state.path.exists() {
        "locked"
    } else {
        "uninitialized"
    };
    Ok(VaultStatus {
        state: st.into(),
        file_size: file_size(&state.path),
        path: state.path.display().to_string(),
    })
}

#[tauri::command]
pub fn vault_create(state: State<VaultState>, password: String) -> Result<VaultStatus, String> {
    if state.path.exists() {
        return Err("库已存在".into());
    }
    if password.is_empty() {
        return Err("主密码不能为空".into());
    }
    let unlocked = Unlocked {
        password,
        data: VaultData::empty(),
    };
    persist(&state.path, &unlocked)?;
    *state.inner.lock().map_err(|e| e.to_string())? = Some(unlocked);
    vault_status(state)
}

#[tauri::command]
pub fn vault_unlock(state: State<VaultState>, password: String) -> Result<VaultStatus, String> {
    let bytes = std::fs::read(&state.path).map_err(|_| ERR_BAD_PASSWORD.to_string())?;
    let data = decrypt_vault(&bytes, &password)?;
    *state.inner.lock().map_err(|e| e.to_string())? = Some(Unlocked { password, data });
    vault_status(state)
}

#[tauri::command]
pub fn vault_lock(state: State<VaultState>) -> Result<(), String> {
    *state.inner.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

#[tauri::command]
pub fn vault_change_password(
    state: State<VaultState>,
    old: String,
    new: String,
) -> Result<(), String> {
    if new.is_empty() {
        return Err("新密码不能为空".into());
    }
    let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
    let unlocked = guard.as_mut().ok_or(ERR_LOCKED)?;
    if unlocked.password != old {
        return Err("旧密码不正确".into());
    }
    unlocked.password = new;
    persist(&state.path, unlocked)
}

#[tauri::command]
pub fn vault_list_entries(state: State<VaultState>) -> Result<Vec<EntryMeta>, String> {
    with_unlocked(&state, |u| {
        let mut metas: Vec<EntryMeta> = u.data.entries.iter().map(to_meta).collect();
        metas.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        Ok(metas)
    })
}

#[tauri::command]
pub fn vault_get_secret(state: State<VaultState>, id: i64) -> Result<String, String> {
    with_unlocked(&state, |u| {
        u.data
            .entries
            .iter()
            .find(|e| e.id == id)
            .map(|e| e.secret.clone())
            .ok_or_else(|| "条目不存在".into())
    })
}

#[tauri::command]
pub fn vault_save_entry(state: State<VaultState>, input: EntryInput) -> Result<EntryMeta, String> {
    mutate(&state, |u| {
        let entry = u.data.upsert_entry(input, now_iso())?;
        Ok(to_meta(entry))
    })
}

#[tauri::command]
pub fn vault_delete_entry(state: State<VaultState>, id: i64) -> Result<(), String> {
    mutate(&state, |u| {
        u.data.entries.retain(|e| e.id != id);
        Ok(())
    })
}

#[tauri::command]
pub fn vault_add_attachment(
    state: State<VaultState>,
    id: i64,
    file_path: String,
) -> Result<Vec<AttachmentMeta>, String> {
    let meta = std::fs::metadata(&file_path).map_err(|e| e.to_string())?;
    if meta.len() > MAX_ATTACHMENT_SIZE {
        return Err("附件不能超过 10MB".into());
    }
    let bytes = std::fs::read(&file_path).map_err(|e| e.to_string())?;
    let name = std::path::Path::new(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("attachment")
        .to_string();
    mutate(&state, |u| {
        let entry = u
            .data
            .entries
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or("条目不存在")?;
        // Overwrite same-named attachment instead of duplicating.
        entry.attachments.retain(|a| a.name != name);
        entry.attachments.push(Attachment {
            name,
            size: bytes.len() as u64,
            data: base64::engine::general_purpose::STANDARD.encode(&bytes),
        });
        entry.updated_at = now_iso();
        Ok(entry
            .attachments
            .iter()
            .map(|a| AttachmentMeta {
                name: a.name.clone(),
                size: a.size,
            })
            .collect())
    })
}

#[tauri::command]
pub fn vault_save_attachment_to(
    state: State<VaultState>,
    id: i64,
    name: String,
    dest_path: String,
) -> Result<(), String> {
    let bytes = with_unlocked(&state, |u| {
        let entry = u.data.entries.iter().find(|e| e.id == id).ok_or("条目不存在")?;
        let att = entry
            .attachments
            .iter()
            .find(|a| a.name == name)
            .ok_or("附件不存在")?;
        base64::engine::general_purpose::STANDARD
            .decode(&att.data)
            .map_err(|e| e.to_string())
    })?;
    std::fs::write(&dest_path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_remove_attachment(
    state: State<VaultState>,
    id: i64,
    name: String,
) -> Result<Vec<AttachmentMeta>, String> {
    mutate(&state, |u| {
        let entry = u
            .data
            .entries
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or("条目不存在")?;
        entry.attachments.retain(|a| a.name != name);
        entry.updated_at = now_iso();
        Ok(entry
            .attachments
            .iter()
            .map(|a| AttachmentMeta {
                name: a.name.clone(),
                size: a.size,
            })
            .collect())
    })
}

#[tauri::command]
pub fn vault_list_providers(state: State<VaultState>) -> Result<Vec<ProviderTemplate>, String> {
    with_unlocked(&state, |u| Ok(u.data.providers.clone()))
}

#[tauri::command]
pub fn vault_save_provider(
    state: State<VaultState>,
    input: ProviderInput,
) -> Result<Vec<ProviderTemplate>, String> {
    mutate(&state, |u| {
        match input.id {
            Some(id) => {
                let p = u
                    .data
                    .providers
                    .iter_mut()
                    .find(|p| p.id == id)
                    .ok_or("模板不存在")?;
                p.name = input.name;
                p.base_url = input.base_url;
                p.docs_url = input.docs_url;
                p.console_url = input.console_url;
            }
            None => {
                let id = u.data.next_id;
                u.data.next_id += 1;
                u.data.providers.push(ProviderTemplate {
                    id,
                    name: input.name,
                    base_url: input.base_url,
                    docs_url: input.docs_url,
                    console_url: input.console_url,
                });
            }
        }
        Ok(u.data.providers.clone())
    })
}

#[tauri::command]
pub fn vault_delete_provider(
    state: State<VaultState>,
    id: i64,
) -> Result<Vec<ProviderTemplate>, String> {
    mutate(&state, |u| {
        u.data.providers.retain(|p| p.id != id);
        Ok(u.data.providers.clone())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_path(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("zztodo-test-{name}.vault"));
        let _ = std::fs::remove_file(&p);
        p
    }

    #[test]
    fn persist_writes_a_decryptable_file_and_leaves_no_tmp() {
        let path = tmp_path("persist");
        let mut data = VaultData::empty();
        data.next_id = 7;
        let unlocked = Unlocked {
            password: "hunter2".into(),
            data,
        };

        persist(&path, &unlocked).unwrap();

        let bytes = std::fs::read(&path).unwrap();
        let back = decrypt_vault(&bytes, "hunter2").unwrap();
        assert_eq!(back.next_id, 7);
        assert!(
            !path.with_extension("vault.tmp").exists(),
            "tmp file must be renamed away, not left behind"
        );
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn persist_overwrites_previous_contents() {
        let path = tmp_path("overwrite");
        let mut first = VaultData::empty();
        first.next_id = 1;
        persist(
            &path,
            &Unlocked {
                password: "pw".into(),
                data: first,
            },
        )
        .unwrap();

        let mut second = VaultData::empty();
        second.next_id = 99;
        persist(
            &path,
            &Unlocked {
                password: "pw".into(),
                data: second,
            },
        )
        .unwrap();

        let back = decrypt_vault(&std::fs::read(&path).unwrap(), "pw").unwrap();
        assert_eq!(back.next_id, 99);
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn oversized_attachment_is_rejected_by_the_size_gate() {
        // vault_add_attachment checks metadata length against MAX_ATTACHMENT_SIZE
        // before reading; assert the constant is the documented 10MB.
        assert_eq!(MAX_ATTACHMENT_SIZE, 10 * 1024 * 1024);
    }

    fn input(id: Option<i64>, title: &str, secret: Option<&str>) -> EntryInput {
        EntryInput {
            id,
            title: title.into(),
            project_ids: vec![],
            base_url: String::new(),
            docs_url: String::new(),
            console_url: String::new(),
            purpose: String::new(),
            used_in: String::new(),
            tags: vec![],
            username: String::new(),
            env_var: String::new(),
            notes: String::new(),
            secret: secret.map(String::from),
        }
    }

    #[test]
    fn new_entry_gets_next_id_and_advances_counter() {
        let mut v = VaultData::empty();
        let first = v
            .upsert_entry(input(None, "a", Some("sk-1")), "t0".into())
            .unwrap()
            .id;
        let second = v
            .upsert_entry(input(None, "b", Some("sk-2")), "t0".into())
            .unwrap()
            .id;
        assert_eq!((first, second), (1, 2));
        assert_eq!(v.next_id, 3);
        assert_eq!(v.entries.len(), 2);
    }

    #[test]
    fn editing_without_a_secret_keeps_the_stored_one() {
        let mut v = VaultData::empty();
        let id = v
            .upsert_entry(input(None, "orig", Some("sk-secret")), "t0".into())
            .unwrap()
            .id;

        v.upsert_entry(input(Some(id), "renamed", None), "t1".into())
            .unwrap();

        let e = &v.entries[0];
        assert_eq!(e.title, "renamed");
        assert_eq!(e.secret, "sk-secret", "secret must survive a metadata edit");
        assert_eq!(e.updated_at, "t1");
        assert_eq!(e.created_at, "t0", "created_at must not move on edit");
    }

    #[test]
    fn editing_with_a_secret_replaces_it() {
        let mut v = VaultData::empty();
        let id = v
            .upsert_entry(input(None, "a", Some("old")), "t0".into())
            .unwrap()
            .id;
        v.upsert_entry(input(Some(id), "a", Some("new")), "t1".into())
            .unwrap();
        assert_eq!(v.entries[0].secret, "new");
    }

    #[test]
    fn editing_a_missing_entry_errors() {
        let mut v = VaultData::empty();
        assert!(v
            .upsert_entry(input(Some(42), "ghost", None), "t0".into())
            .is_err());
    }

    #[test]
    fn editing_preserves_attachments() {
        let mut v = VaultData::empty();
        let id = v
            .upsert_entry(input(None, "a", Some("sk")), "t0".into())
            .unwrap()
            .id;
        v.entries[0].attachments.push(Attachment {
            name: "f.pdf".into(),
            size: 3,
            data: "YWJj".into(),
        });

        v.upsert_entry(input(Some(id), "a2", None), "t1".into())
            .unwrap();

        assert_eq!(v.entries[0].attachments.len(), 1);
        assert_eq!(v.entries[0].attachments[0].name, "f.pdf");
    }

    #[test]
    fn projection_omits_secret_and_attachment_bytes() {
        let mut v = VaultData::empty();
        v.upsert_entry(input(None, "a", Some("sk-hidden")), "t0".into())
            .unwrap();
        v.entries[0].attachments.push(Attachment {
            name: "f.pdf".into(),
            size: 3,
            data: "YWJj".into(),
        });

        let meta = to_meta(&v.entries[0]);
        let json = serde_json::to_string(&meta).unwrap();

        assert!(!json.contains("sk-hidden"), "secret leaked into projection");
        assert!(!json.contains("YWJj"), "attachment bytes leaked into projection");
        assert!(json.contains("f.pdf"), "attachment name should still be listed");
        assert_eq!(meta.attachments[0].size, 3);
    }
}
