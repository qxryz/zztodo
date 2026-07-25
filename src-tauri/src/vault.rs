use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::{Aead, KeyInit};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

pub const MAX_ATTACHMENT_SIZE: u64 = 10 * 1024 * 1024;

const MAGIC: &[u8; 8] = b"ZZVAULT1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 24;
/// Argon2id defaults (KiB, iterations, lanes).
pub const KDF_M: u32 = 65536;
pub const KDF_T: u32 = 3;
pub const KDF_P: u32 = 4;

pub const ERR_BAD_PASSWORD: &str = "密码错误或文件损坏";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Attachment {
    pub name: String,
    pub size: u64,
    /// base64-encoded content, encrypted along with the whole vault.
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyEntry {
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
    pub secret: String,
    pub attachments: Vec<Attachment>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderTemplate {
    pub id: i64,
    pub name: String,
    pub base_url: String,
    pub docs_url: String,
    pub console_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultData {
    pub version: u32,
    pub entries: Vec<KeyEntry>,
    pub providers: Vec<ProviderTemplate>,
    pub next_id: i64,
}

impl VaultData {
    pub fn empty() -> Self {
        VaultData {
            version: 1,
            entries: Vec::new(),
            providers: Vec::new(),
            next_id: 1,
        }
    }
}

fn derive_key(password: &str, salt: &[u8], m: u32, t: u32, p: u32) -> Result<[u8; 32], String> {
    let params = Params::new(m, t, p, Some(32)).map_err(|e| e.to_string())?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| e.to_string())?;
    Ok(key)
}

fn encrypt_with_params(
    data: &VaultData,
    password: &str,
    m: u32,
    t: u32,
    p: u32,
) -> Result<Vec<u8>, String> {
    let plaintext = serde_json::to_vec(data).map_err(|e| e.to_string())?;

    let mut salt = [0u8; SALT_LEN];
    let mut nonce = [0u8; NONCE_LEN];
    getrandom(&mut salt)?;
    getrandom(&mut nonce)?;

    let mut key = derive_key(password, &salt, m, t, p)?;
    let cipher = XChaCha20Poly1305::new((&key).into());
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), plaintext.as_ref())
        .map_err(|e| e.to_string())?;
    key.zeroize();

    let mut out = Vec::with_capacity(8 + 12 + SALT_LEN + NONCE_LEN + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.extend_from_slice(&m.to_le_bytes());
    out.extend_from_slice(&t.to_le_bytes());
    out.extend_from_slice(&p.to_le_bytes());
    out.extend_from_slice(&salt);
    out.extend_from_slice(&nonce);
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

pub fn encrypt_vault(data: &VaultData, password: &str) -> Result<Vec<u8>, String> {
    encrypt_with_params(data, password, KDF_M, KDF_T, KDF_P)
}

pub fn decrypt_vault(bytes: &[u8], password: &str) -> Result<VaultData, String> {
    let header_len = 8 + 12 + SALT_LEN + NONCE_LEN;
    if bytes.len() <= header_len || &bytes[..8] != MAGIC {
        return Err(ERR_BAD_PASSWORD.into());
    }
    let m = u32::from_le_bytes(bytes[8..12].try_into().unwrap());
    let t = u32::from_le_bytes(bytes[12..16].try_into().unwrap());
    let p = u32::from_le_bytes(bytes[16..20].try_into().unwrap());
    let salt = &bytes[20..20 + SALT_LEN];
    let nonce = &bytes[20 + SALT_LEN..20 + SALT_LEN + NONCE_LEN];
    let ciphertext = &bytes[header_len..];

    let mut key = derive_key(password, salt, m, t, p).map_err(|_| ERR_BAD_PASSWORD.to_string())?;
    let cipher = XChaCha20Poly1305::new((&key).into());
    let plaintext = cipher
        .decrypt(XNonce::from_slice(nonce), ciphertext)
        .map_err(|_| ERR_BAD_PASSWORD.to_string());
    key.zeroize();

    serde_json::from_slice(&plaintext?).map_err(|_| ERR_BAD_PASSWORD.into())
}

fn getrandom(buf: &mut [u8]) -> Result<(), String> {
    use chacha20poly1305::aead::rand_core::RngCore;
    chacha20poly1305::aead::OsRng.fill_bytes(buf);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // Small Argon2 params so tests run fast.
    fn enc(data: &VaultData, pw: &str) -> Vec<u8> {
        encrypt_with_params(data, pw, 1024, 1, 1).unwrap()
    }

    fn sample() -> VaultData {
        let mut v = VaultData::empty();
        v.entries.push(KeyEntry {
            id: 1,
            title: "OpenAI 主力".into(),
            project_ids: vec![2, 3],
            base_url: "https://api.openai.com/v1".into(),
            docs_url: "https://platform.openai.com/docs".into(),
            console_url: "https://platform.openai.com".into(),
            purpose: "开发测试".into(),
            model_id: "gpt-4o-mini".into(),
            tags: vec!["personal".into()],
            username: "me@example.com".into(),
            env_var: "OPENAI_API_KEY".into(),
            notes: "备注".into(),
            secret: "sk-test-123".into(),
            attachments: vec![Attachment {
                name: "invoice.pdf".into(),
                size: 3,
                data: "YWJj".into(),
            }],
            created_at: "2026-07-25T00:00:00Z".into(),
            updated_at: "2026-07-25T00:00:00Z".into(),
        });
        v.next_id = 2;
        v
    }

    #[test]
    fn roundtrip() {
        let data = sample();
        let bytes = enc(&data, "hunter2");
        let back = decrypt_vault(&bytes, "hunter2").unwrap();
        assert_eq!(back.entries.len(), 1);
        assert_eq!(back.entries[0].secret, "sk-test-123");
        assert_eq!(back.entries[0].attachments[0].data, "YWJj");
        assert_eq!(back.next_id, 2);
    }

    #[test]
    fn wrong_password_rejected() {
        let bytes = enc(&sample(), "hunter2");
        let err = decrypt_vault(&bytes, "wrong").unwrap_err();
        assert_eq!(err, ERR_BAD_PASSWORD);
    }

    #[test]
    fn truncated_file_rejected() {
        let bytes = enc(&sample(), "hunter2");
        assert!(decrypt_vault(&bytes[..30], "hunter2").is_err());
        assert!(decrypt_vault(&[], "hunter2").is_err());
    }

    #[test]
    fn tampered_ciphertext_rejected() {
        let mut bytes = enc(&sample(), "hunter2");
        let last = bytes.len() - 1;
        bytes[last] ^= 0xff;
        assert_eq!(decrypt_vault(&bytes, "hunter2").unwrap_err(), ERR_BAD_PASSWORD);
    }

    #[test]
    fn bad_magic_rejected() {
        let mut bytes = enc(&sample(), "hunter2");
        bytes[0] = b'X';
        assert_eq!(decrypt_vault(&bytes, "hunter2").unwrap_err(), ERR_BAD_PASSWORD);
    }

    #[test]
    fn fresh_salt_and_nonce_each_save() {
        let data = sample();
        let a = enc(&data, "hunter2");
        let b = enc(&data, "hunter2");
        // salt || nonce region must differ between saves
        assert_ne!(a[20..20 + SALT_LEN + NONCE_LEN], b[20..20 + SALT_LEN + NONCE_LEN]);
    }
}
