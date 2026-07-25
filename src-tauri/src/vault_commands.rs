use crate::vault::{
    decrypt_vault, default_auth_style, encrypt_vault, Attachment, KeyEntry, ProviderTemplate,
    VaultData, ERR_BAD_PASSWORD, MAX_ATTACHMENT_SIZE,
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

/// Delete the vault file and any tmp left behind by an interrupted save.
/// Idempotent: a missing file is not an error.
fn remove_vault_files(path: &PathBuf) -> Result<(), String> {
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("vault.tmp");
    if tmp.exists() {
        std::fs::remove_file(&tmp).map_err(|e| e.to_string())?;
    }
    Ok(())
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
    pub model_id: String,
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
        model_id: e.model_id.clone(),
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
    pub model_id: String,
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
    /// Required for new templates; default on edit if missing.
    #[serde(default = "default_auth_style")]
    pub auth_style: String,
}

const ERR_LOCKED: &str = "库未解锁";

const FIXED_TAGS: &[&str] = &["订阅", "按量计费"];

/// Maximum number of projects a single key can bind to.
const MAX_PROJECTS_PER_KEY: usize = 2;
/// Maximum number of tags a single key can carry (1 custom + 1 fixed).
const MAX_TAGS_PER_KEY: usize = 2;

fn validate_input(input: &EntryInput) -> Result<(Vec<i64>, Vec<String>), String> {
    // Dedupe while preserving caller order so duplicates don't sneak past
    // the length check below.
    let mut seen_p = std::collections::HashSet::new();
    let project_ids: Vec<i64> = input
        .project_ids
        .iter()
        .copied()
        .filter(|id| seen_p.insert(*id))
        .collect();
    if project_ids.len() > MAX_PROJECTS_PER_KEY {
        return Err(format!(
            "所属项目最多绑定 {MAX_PROJECTS_PER_KEY} 个"
        ));
    }

    let mut seen_t = std::collections::HashSet::new();
    let tags: Vec<String> = input
        .tags
        .iter()
        .map(|t| t.trim().to_string())
        .filter(|t| !t.is_empty())
        .filter(|t| seen_t.insert(t.clone()))
        .collect();
    if tags.len() > MAX_TAGS_PER_KEY {
        return Err(format!("标签最多 {MAX_TAGS_PER_KEY} 个（1 个自定义 + 1 个「订阅/按量计费」）"));
    }
    let fixed_count = tags.iter().filter(|t| FIXED_TAGS.contains(&t.as_str())).count();
    if fixed_count > 1 {
        return Err("固定标签只能在「订阅」和「按量计费」中二选一".into());
    }

    Ok((project_ids, tags))
}

impl VaultData {
    /// Insert or update an entry. `input.secret == None` keeps the stored
    /// secret, so editing an entry never has to round-trip the key material
    /// through the frontend.
    fn upsert_entry(&mut self, input: EntryInput, now: String) -> Result<&KeyEntry, String> {
        let (project_ids, tags) = validate_input(&input)?;
        let idx = match input.id {
            Some(id) => {
                let i = self
                    .entries
                    .iter()
                    .position(|e| e.id == id)
                    .ok_or("条目不存在")?;
                let entry = &mut self.entries[i];
                entry.title = input.title;
                entry.project_ids = project_ids;
                entry.base_url = input.base_url;
                entry.docs_url = input.docs_url;
                entry.console_url = input.console_url;
                entry.purpose = input.purpose;
                entry.model_id = input.model_id.trim().to_string();
                entry.tags = tags;
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
                    project_ids,
                    base_url: input.base_url,
                    docs_url: input.docs_url,
                    console_url: input.console_url,
                    purpose: input.purpose,
                    model_id: input.model_id.trim().to_string(),
                    tags,
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

/// Delete the vault outright, returning to the uninitialized state.
///
/// This is the documented escape hatch for a forgotten master password: the
/// ciphertext is unrecoverable without it, so there is nothing worth keeping.
/// No password is required — the caller by definition does not have it. The
/// confirmation lives in the UI.
#[tauri::command]
pub fn vault_destroy(state: State<VaultState>) -> Result<VaultStatus, String> {
    {
        // Drop any unlocked copy first so the in-memory password is zeroized
        // even if the file removal below fails.
        let mut guard = state.inner.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    remove_vault_files(&state.path)?;
    vault_status(state)
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
    let auth_style = match input.auth_style.as_str() {
        "openai" | "anthropic" => input.auth_style,
        other => return Err(format!("不支持的鉴权方式：{other}（应为 openai / anthropic）")),
    };
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
                p.auth_style = auth_style.clone();
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
                    auth_style: auth_style.clone(),
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

fn looks_like_anthropic(base_url: &str) -> bool {
    base_url.to_lowercase().contains("anthropic")
}

/// User-selectable protocol for `vault_fetch_models`. `auto` falls back to
/// the URL substring heuristic in `looks_like_anthropic`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FetchProtocol {
    Auto,
    OpenAi,
    Anthropic,
}

impl FetchProtocol {
    fn parse(raw: Option<&str>) -> Self {
        match raw.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
            Some("openai") => Self::OpenAi,
            Some("anthropic") => Self::Anthropic,
            // None / "" / "auto" / anything unrecognised: defer to the URL hint.
            _ => Self::Auto,
        }
    }

    fn from_url(base_url: &str) -> Self {
        if looks_like_anthropic(base_url) {
            Self::Anthropic
        } else {
            Self::OpenAi
        }
    }
}

fn join_models_url(base_url: &str) -> Result<String, String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err("baseurl 不能为空".into());
    }
    let mut url = url::Url::parse(trimmed)
        .map_err(|e| format!("baseurl 无法解析（{trimmed}）：{e}"))?;
    let mut segs: Vec<String> = url
        .path_segments()
        .map(|s| s.filter(|p| !p.is_empty()).map(String::from).collect())
        .unwrap_or_default();
    segs.push("models".to_string());
    url.set_path(&format!("/{}", segs.join("/")));
    // /models should be called bare: any pre-existing query/fragment in the
    // baseurl would otherwise leak into the request URL.
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

/// Fetch available model IDs from a provider's `/models` endpoint.
///
/// Supports OpenAI-compatible providers (Authorization: Bearer <key>, response
/// `{"data":[{"id":...}]}`) and Anthropic (x-api-key + anthropic-version,
/// response `{"data":[{"id":...}]}`). The protocol can be chosen explicitly
/// via the `protocol` argument (`"openai"` or `"anthropic"`); otherwise it
/// falls back to inspecting the base URL for the substring "anthropic".
#[tauri::command]
pub async fn vault_fetch_models(
    base_url: String,
    api_key: String,
    protocol: Option<String>,
) -> Result<Vec<String>, String> {
    let url = join_models_url(&base_url)?;
    let key = api_key.trim().to_string();
    if key.is_empty() {
        return Err("请先填写 key 再拉取模型".into());
    }

    let picked = match FetchProtocol::parse(protocol.as_deref()) {
        FetchProtocol::Auto => FetchProtocol::from_url(&base_url),
        explicit => explicit,
    };

    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(concat!("zztodo/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| format!("构造 HTTP 客户端失败：{e}"))?;

    let mut req = client.get(&url).header("Accept", "application/json");
    match picked {
        FetchProtocol::Anthropic => {
            req = req
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01");
        }
        FetchProtocol::OpenAi => {
            req = req.bearer_auth(&key);
        }
        FetchProtocol::Auto => unreachable!("Auto is resolved before matching"),
    }

    let resp = req.send().await.map_err(|e| format!("网络错误：{url}：{e}"))?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        let snippet: String = body.chars().take(200).collect();
        let snippet = snippet.replace('\n', " ");
        return Err(format!(
            "拉取模型失败：{url} HTTP {status} {snippet}"
        ));
    }

    let val: serde_json::Value = resp.json().await.map_err(|e| {
        format!("返回非 JSON（可能是 CDN/网关拦截页）：{url}：{e}")
    })?;

    let data = val
        .get("data")
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            let keys = val
                .as_object()
                .map(|o| {
                    let mut ks: Vec<&String> = o.keys().collect();
                    ks.sort();
                    ks.iter().map(|s| s.as_str()).collect::<Vec<_>>().join(",")
                })
                .unwrap_or_else(|| "(非 JSON 对象)".to_string());
            format!(
                "返回结构里没有 data 数组（看到的字段：{keys}）。{url}"
            )
        })?;

    let models: Vec<String> = data
        .iter()
        .filter_map(|m| m.get("id").and_then(|id| id.as_str()).map(String::from))
        .collect();

    Ok(models)
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
            model_id: String::new(),
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

    #[test]
    fn every_field_survives_a_save_encrypt_reload_cycle() {
        let mut v = VaultData::empty();
        let full = EntryInput {
            id: None,
            title: "OpenAI 主力".into(),
            project_ids: vec![3, 7],
            base_url: "https://api.openai.com/v1".into(),
            docs_url: "https://platform.openai.com/docs".into(),
            console_url: "https://platform.openai.com/api-keys".into(),
            purpose: "生产环境".into(),
            model_id: "gpt-4o-mini".into(),
            tags: vec!["生产".into(), "订阅".into()],
            username: "me@example.com".into(),
            env_var: "OPENAI_API_KEY".into(),
            notes: "每月 200 刀额度".into(),
            secret: Some("sk-live-abc123".into()),
        };
        v.upsert_entry(full, "2026-07-25T00:00:00Z".into()).unwrap();

        let bytes = encrypt_vault(&v, "master-pw").unwrap();
        let back = decrypt_vault(&bytes, "master-pw").unwrap();
        let e = &back.entries[0];

        assert_eq!(e.title, "OpenAI 主力");
        assert_eq!(e.project_ids, vec![3, 7]);
        assert_eq!(e.base_url, "https://api.openai.com/v1");
        assert_eq!(e.docs_url, "https://platform.openai.com/docs");
        assert_eq!(e.console_url, "https://platform.openai.com/api-keys");
        assert_eq!(e.purpose, "生产环境");
        assert_eq!(e.model_id, "gpt-4o-mini");
        assert_eq!(e.tags, vec!["生产".to_string(), "订阅".to_string()]);
        assert_eq!(e.username, "me@example.com");
        assert_eq!(e.env_var, "OPENAI_API_KEY");
        assert_eq!(e.notes, "每月 200 刀额度");
        assert_eq!(e.secret, "sk-live-abc123");
        assert_eq!(e.created_at, "2026-07-25T00:00:00Z");
    }

    #[test]
    fn providers_and_entries_share_the_id_counter_without_collision() {
        let mut v = VaultData::empty();
        let entry_id = v
            .upsert_entry(input(None, "k", Some("s")), "t0".into())
            .unwrap()
            .id;

        // Providers draw from the same next_id, so ids must not repeat.
        let provider_id = v.next_id;
        v.next_id += 1;
        v.providers.push(ProviderTemplate {
            id: provider_id,
            name: "我的中转".into(),
            base_url: "https://relay.example.com/v1".into(),
            docs_url: String::new(),
            console_url: String::new(),
            auth_style: "openai".into(),
        });

        let next_entry_id = v
            .upsert_entry(input(None, "k2", Some("s2")), "t0".into())
            .unwrap()
            .id;

        assert_ne!(entry_id, provider_id);
        assert_ne!(next_entry_id, provider_id);
        assert_eq!((entry_id, provider_id, next_entry_id), (1, 2, 3));
    }

    #[test]
    fn attachment_with_the_same_name_is_replaced_not_duplicated() {
        // Mirrors vault_add_attachment's retain-then-push behaviour.
        let mut v = VaultData::empty();
        v.upsert_entry(input(None, "a", Some("s")), "t0".into()).unwrap();
        let atts = &mut v.entries[0].attachments;

        for data in ["Zmlyc3Q=", "c2Vjb25k"] {
            atts.retain(|a| a.name != "same.pdf");
            atts.push(Attachment {
                name: "same.pdf".into(),
                size: 5,
                data: data.into(),
            });
        }

        assert_eq!(atts.len(), 1, "same-named attachment must not duplicate");
        assert_eq!(atts[0].data, "c2Vjb25k", "later import wins");
    }

    #[test]
    fn destroy_removes_the_vault_and_any_leftover_tmp() {
        let path = tmp_path("destroy");
        let tmp = path.with_extension("vault.tmp");
        persist(
            &path,
            &Unlocked {
                password: "pw".into(),
                data: VaultData::empty(),
            },
        )
        .unwrap();
        // Simulate a save that crashed between write and rename.
        std::fs::write(&tmp, b"partial").unwrap();

        remove_vault_files(&path).unwrap();

        assert!(!path.exists(), "vault file must be gone");
        assert!(!tmp.exists(), "leftover tmp must not survive a destroy");
    }

    #[test]
    fn destroy_on_a_missing_vault_is_not_an_error() {
        let path = tmp_path("destroy-missing");
        assert!(!path.exists());
        remove_vault_files(&path).expect("destroying nothing must succeed");
    }

    fn tags_input(mut base: EntryInput, tags: Vec<&str>, projects: Vec<i64>) -> EntryInput {
        base.tags = tags.into_iter().map(String::from).collect();
        base.project_ids = projects;
        base
    }

    #[test]
    fn rejects_more_than_two_projects() {
        let mut v = VaultData::empty();
        let too_many = tags_input(input(None, "k", Some("s")), vec![], vec![1, 2, 3]);
        let err = v.upsert_entry(too_many, "t".into()).unwrap_err();
        assert!(err.contains("最多绑定"), "got: {err}");
        assert_eq!(v.entries.len(), 0);
    }

    #[test]
    fn accepts_two_projects_with_dedup() {
        let mut v = VaultData::empty();
        let ok = tags_input(input(None, "k", Some("s")), vec!["订阅"], vec![1, 2, 1]);
        v.upsert_entry(ok, "t".into()).unwrap();
        // The duplicate [1, 2, 1] must collapse to [1, 2] before storage.
        assert_eq!(v.entries[0].project_ids, vec![1, 2]);
    }

    #[test]
    fn rejects_more_than_two_tags() {
        let mut v = VaultData::empty();
        let too_many = tags_input(input(None, "k", Some("s")), vec!["a", "b", "c"], vec![]);
        let err = v.upsert_entry(too_many, "t".into()).unwrap_err();
        assert!(err.contains("最多"), "got: {err}");
    }

    #[test]
    fn rejects_both_fixed_tags_at_once() {
        let mut v = VaultData::empty();
        let both = tags_input(
            input(None, "k", Some("s")),
            vec!["订阅", "按量计费"],
            vec![],
        );
        let err = v.upsert_entry(both, "t".into()).unwrap_err();
        assert!(err.contains("二选一"), "got: {err}");
    }

    #[test]
    fn accepts_one_custom_plus_one_fixed() {
        let mut v = VaultData::empty();
        let ok = tags_input(input(None, "k", Some("s")), vec!["生产", "订阅"], vec![]);
        v.upsert_entry(ok, "t".into()).unwrap();
        assert_eq!(v.entries[0].tags, vec!["生产", "订阅"]);
    }

    #[test]
    fn trims_and_dedupes_tags_keeping_order() {
        let mut v = VaultData::empty();
        let messy = tags_input(
            input(None, "k", Some("s")),
            vec![" 生产 ", "生产", "订阅", ""],
            vec![],
        );
        v.upsert_entry(messy, "t".into()).unwrap();
        assert_eq!(v.entries[0].tags, vec!["生产", "订阅"]);
    }

    #[test]
    fn models_endpoint_strips_trailing_slash_and_appends_models() {
        // Typical cases — including the project's builtin providers.
        for (input, want) in [
            ("https://api.openai.com/v1", "https://api.openai.com/v1/models"),
            (
                "https://api.openai.com/v1/",
                "https://api.openai.com/v1/models",
            ),
            ("https://api.openai.com", "https://api.openai.com/models"),
            (
                "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
            ),
            (
                "https://ark.cn-beijing.volces.com/api/v3",
                "https://ark.cn-beijing.volces.com/api/v3/models",
            ),
            (
                "http://localhost:11434/v1",
                "http://localhost:11434/v1/models",
            ),
        ] {
            assert_eq!(join_models_url(input).unwrap(), want, "{input}");
        }
    }

    #[test]
    fn models_endpoint_drops_query_and_fragment() {
        // Query/fragment on the baseurl must NOT bleed into /models — most
        // providers won't recognise `…/models?key=foo` as the right endpoint.
        assert_eq!(
            join_models_url("https://api.openai.com/v1?foo=bar").unwrap(),
            "https://api.openai.com/v1/models"
        );
        assert_eq!(
            join_models_url("https://api.openai.com/v1#frag").unwrap(),
            "https://api.openai.com/v1/models"
        );
    }

    #[test]
    fn models_endpoint_rejects_empty_and_invalid() {
        assert!(join_models_url("").is_err());
        assert!(join_models_url("   ").is_err());
        // Not a parseable URL → friendly error.
        assert!(join_models_url("not a url").is_err());
    }

    #[test]
    fn old_format_providers_default_auth_style_to_openai() {
        // Vaults saved before v0.1.10 don't carry `auth_style`. The default
        // must be "openai" so existing custom templates keep working until
        // the user reopens ProviderManager and confirms the choice.
        let legacy = r#"{
            "version": 1,
            "next_id": 1,
            "providers": [
                {
                    "id": 1,
                    "name": "我的中转",
                    "base_url": "https://relay.example.com/v1",
                    "docs_url": "",
                    "console_url": ""
                }
            ],
            "entries": []
        }"#;
        let data: VaultData = serde_json::from_str(legacy).unwrap();
        assert_eq!(data.providers.len(), 1);
        assert_eq!(data.providers[0].auth_style, "openai");
    }

    #[test]
    fn auth_style_roundtrips_through_save_encrypt_reload() {
        let mut v = VaultData::empty();
        v.next_id = 2;
        v.providers.push(ProviderTemplate {
            id: 1,
            name: "Anthropic Custom".into(),
            base_url: "https://api.example.com/anthropic".into(),
            docs_url: String::new(),
            console_url: String::new(),
            auth_style: "anthropic".into(),
        });

        let bytes = encrypt_vault(&v, "pw").unwrap();
        let back = decrypt_vault(&bytes, "pw").unwrap();
        assert_eq!(back.providers[0].auth_style, "anthropic");
    }

    #[test]
    fn anthropic_detection_is_case_insensitive_and_substring_based() {
        assert!(looks_like_anthropic("https://api.anthropic.com/v1"));
        assert!(looks_like_anthropic("https://ANTHROPIC.example.com"));
        assert!(looks_like_anthropic("https://relay.example.com/anthropic-proxy"));
        assert!(!looks_like_anthropic("https://api.openai.com/v1"));
    }

    #[test]
    fn fetch_protocol_parse_normalises_input() {
        assert_eq!(FetchProtocol::parse(None), FetchProtocol::Auto);
        assert_eq!(FetchProtocol::parse(Some("")), FetchProtocol::Auto);
        assert_eq!(FetchProtocol::parse(Some("auto")), FetchProtocol::Auto);
        assert_eq!(FetchProtocol::parse(Some("  auto  ")), FetchProtocol::Auto);
        assert_eq!(FetchProtocol::parse(Some("openai")), FetchProtocol::OpenAi);
        assert_eq!(FetchProtocol::parse(Some("OPENAI")), FetchProtocol::OpenAi);
        assert_eq!(
            FetchProtocol::parse(Some("anthropic")),
            FetchProtocol::Anthropic
        );
        // Garbage in falls back to Auto rather than panicking.
        assert_eq!(FetchProtocol::parse(Some("bogus")), FetchProtocol::Auto);
    }

    #[test]
    fn fetch_protocol_from_url_defaults_anthropic_substring() {
        assert_eq!(
            FetchProtocol::from_url("https://api.anthropic.com/v1"),
            FetchProtocol::Anthropic,
        );
        assert_eq!(
            FetchProtocol::from_url("https://api.openai.com/v1"),
            FetchProtocol::OpenAi,
        );
        // A gateway exposing Anthropic-compatible format but without the
        // "anthropic" substring must NOT be silently routed to OpenAI; the
        // frontend's explicit picker is the only way to opt in.
        assert_eq!(
            FetchProtocol::from_url("https://relay.example.com/gateway/v1"),
            FetchProtocol::OpenAi,
        );
    }
}
