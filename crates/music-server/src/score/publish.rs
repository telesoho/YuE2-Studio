//! Publish one score into a jianpu library on a static GitHub Pages repo.
//!
//! A publish writes `scores/<id>.abc` and upserts `scores/index.json` through
//! the Contents API. The repo, branch and public site come from
//! `github-publish.json` beside the other studio data; a missing file keeps
//! the original target.

use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::reading::{warn_code, warn_fields};

const API: &str = "https://api.github.com";
const TARGET_FILE: &str = "github-publish.json";

pub const DEFAULT_REPO: &str = "telesoho/www.telesoho.com";
pub const DEFAULT_BRANCH: &str = "master";
pub const DEFAULT_SITE: &str = "https://www.telesoho.com";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PublishTarget {
    pub repo: String,
    pub branch: String,
    pub site: String,
}

impl Default for PublishTarget {
    fn default() -> Self {
        Self { repo: DEFAULT_REPO.into(), branch: DEFAULT_BRANCH.into(), site: DEFAULT_SITE.into() }
    }
}

fn segment(value: &str) -> bool {
    !value.is_empty()
        && !value.contains("..")
        && !value.starts_with('.')
        && !value.ends_with('.')
        && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '-')
}

/// `owner/name`, a branch with no spaces, and an https origin with no path.
pub fn parse_target(repo: &str, branch: &str, site: &str) -> Result<PublishTarget, String> {
    let mut parts = repo.trim().split('/');
    let owner = parts.next().unwrap_or("");
    let name = parts.next().unwrap_or("");
    if parts.next().is_some() || !segment(owner) || !segment(name) {
        return Err("repository must be owner/name".into());
    }
    let branch = branch.trim();
    let branch_ok = !branch.is_empty()
        && !branch.contains("..")
        && !branch.starts_with('/')
        && !branch.ends_with('/')
        && branch.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'));
    if !branch_ok {
        return Err("branch must be a single path with no spaces".into());
    }
    let raw = site.trim().trim_end_matches('/');
    // A bare host is the form people type next to the https:// placeholder.
    let site = if raw.contains("://") { raw.to_owned() } else { format!("https://{raw}") };
    let Some(host) = site.strip_prefix("https://") else {
        return Err("site must be an https origin with no path".into());
    };
    let host_ok = !host.is_empty()
        && !host.contains("..")
        && !host.starts_with('.')
        && !host.ends_with('.')
        && host.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'));
    if !host_ok {
        return Err("site must be an https origin with no path".into());
    }
    Ok(PublishTarget { repo: format!("{owner}/{name}"), branch: branch.to_owned(), site: format!("https://{host}") })
}

pub fn published_url(site: &str, id: &str) -> String {
    format!("{site}/jianpu/#{id}")
}

/// Saved target, or the built-in one when the file is missing or unreadable.
pub fn load_target() -> PublishTarget {
    let Some(root) = crate::studio_data_root() else { return PublishTarget::default() };
    let Ok(text) = std::fs::read_to_string(root.join(TARGET_FILE)) else { return PublishTarget::default() };
    let Ok(stored) = serde_json::from_str::<PublishTarget>(&text) else { return PublishTarget::default() };
    parse_target(&stored.repo, &stored.branch, &stored.site).unwrap_or_default()
}

pub fn store_target(repo: &str, branch: &str, site: &str) -> Result<PublishTarget, String> {
    let target = parse_target(repo, branch, site)?;
    let root = crate::studio_data_root().ok_or_else(|| "no per-user application data directory".to_owned())?;
    std::fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let mut bytes = serde_json::to_vec_pretty(&target).map_err(|error| error.to_string())?;
    bytes.push(b'\n');
    std::fs::write(root.join(TARGET_FILE), bytes).map_err(|error| error.to_string())?;
    Ok(target)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct IndexEntry {
    pub id: String,
    pub title: String,
    pub key: String,
    pub updated: String,
}

pub fn safe_id(id: &str) -> bool {
    !id.is_empty() && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
}

pub fn key_name(abc: &str) -> String {
    abc.lines()
        .find_map(|line| {
            let rest = line.trim().strip_prefix("K:")?;
            rest.split_whitespace().next().map(str::to_owned)
        })
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "C".into())
}

/// Replace the entry with the same id, then sort by title.
pub fn merge_index(current: &str, entry: IndexEntry) -> Result<Vec<IndexEntry>, String> {
    let text = current.trim();
    let mut entries: Vec<IndexEntry> = if text.is_empty() {
        Vec::new()
    } else {
        serde_json::from_str(text).map_err(|_| warn_fields("githubPublishFailed", &[("detail", "scores/index.json is not a list".into())]))?
    };
    if let Some(existing) = entries.iter_mut().find(|item| item.id == entry.id) {
        *existing = entry;
    } else {
        entries.push(entry);
    }
    entries.sort_by(|a, b| a.title.cmp(&b.title).then_with(|| a.id.cmp(&b.id)));
    Ok(entries)
}

fn commit_message(title: &str) -> String {
    let clean: String = title.chars().filter(|c| !c.is_control()).take(80).collect();
    let clean = clean.trim();
    if clean.is_empty() { "publish jianpu".into() } else { format!("publish jianpu: {clean}") }
}

fn detail(status: reqwest::StatusCode, body: &str) -> String {
    let message = serde_json::from_str::<Value>(body)
        .ok()
        .and_then(|value| value.get("message").and_then(Value::as_str).map(str::to_owned))
        .unwrap_or_else(|| body.chars().take(180).collect());
    warn_fields("githubPublishFailed", &[("detail", format!("{status}: {message}"))])
}

async fn read_file(client: &reqwest::Client, token: &str, target: &PublishTarget, path: &str) -> Result<Option<(Option<String>, Vec<u8>)>, String> {
    let url = format!("{API}/repos/{}/contents/{path}?ref={}", target.repo, target.branch);
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| warn_fields("githubPublishFailed", &[("detail", error.to_string())]))?;
    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if response.status() == reqwest::StatusCode::UNAUTHORIZED || response.status() == reqwest::StatusCode::FORBIDDEN {
        return Err(warn_code("githubTokenRejected"));
    }
    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(detail(status, &body));
    }
    let value: Value = serde_json::from_str(&body).map_err(|_| detail(status, &body))?;
    let sha = value.get("sha").and_then(Value::as_str).map(str::to_owned);
    let encoded: String = value.get("content").and_then(Value::as_str).unwrap_or("").chars().filter(|c| !c.is_whitespace()).collect();
    let bytes = if encoded.is_empty() {
        Vec::new()
    } else {
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|_| warn_fields("githubPublishFailed", &[("detail", format!("{path} is not base64"))]))?
    };
    Ok(Some((sha, bytes)))
}

async fn put_file(client: &reqwest::Client, token: &str, target: &PublishTarget, path: &str, bytes: &[u8], message: &str) -> Result<(), String> {
    let url = format!("{API}/repos/{}/contents/{path}", target.repo);
    let mut sha = read_file(client, token, target, path).await?.and_then(|(sha, _)| sha);
    let content = base64::engine::general_purpose::STANDARD.encode(bytes);
    for _ in 0..2 {
        let mut payload = serde_json::json!({
            "message": message,
            "content": content,
            "branch": target.branch,
        });
        if let Some(sha) = &sha {
            payload["sha"] = Value::String(sha.clone());
        }
        let response = client
            .put(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .json(&payload)
            .send()
            .await
            .map_err(|error| warn_fields("githubPublishFailed", &[("detail", error.to_string())]))?;
        let status = response.status();
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(warn_code("githubTokenRejected"));
        }
        if status == reqwest::StatusCode::CONFLICT || status == reqwest::StatusCode::UNPROCESSABLE_ENTITY {
            sha = read_file(client, token, target, path).await?.and_then(|(sha, _)| sha);
            continue;
        }
        if status.is_success() {
            return Ok(());
        }
        let body = response.text().await.unwrap_or_default();
        return Err(detail(status, &body));
    }
    Err(warn_fields("githubPublishFailed", &[("detail", format!("{path} changed while publishing"))]))
}

async fn github_json(client: &reqwest::Client, token: &str, url: &str, missing: &str) -> Result<Value, String> {
    let response = client
        .get(url)
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| warn_fields("githubPublishFailed", &[("detail", error.to_string())]))?;
    let status = response.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(warn_code("githubTokenRejected"));
    }
    let body = response.text().await.unwrap_or_default();
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err(warn_fields("githubPublishFailed", &[("detail", format!("{missing} not found"))]));
    }
    if !status.is_success() {
        return Err(detail(status, &body));
    }
    serde_json::from_str(&body).map_err(|_| detail(status, &body))
}

/// The token can see the repo, the branch exists, and the token may push.
/// Does not write.
pub async fn probe(token: &str, target: &PublishTarget) -> Result<Value, String> {
    if token.trim().is_empty() {
        return Err(warn_code("githubTokenMissing"));
    }
    let client = crate::net::client();
    let repo = github_json(&client, token, &format!("{API}/repos/{}", target.repo), "repository").await?;
    if repo.pointer("/permissions/push").and_then(Value::as_bool) != Some(true) {
        return Err(warn_fields("githubPublishFailed", &[("detail", "token cannot push to this repository".into())]));
    }
    let branch = target.branch.replace('/', "%2F");
    github_json(&client, token, &format!("{API}/repos/{}/branches/{branch}", target.repo), "branch").await?;
    Ok(serde_json::json!({
        "ok": true,
        "repo": target.repo,
        "branch": target.branch,
        "site": target.site,
        "can_push": true,
    }))
}

pub async fn publish(id: &str, title: &str, abc: &str, token: &str, target: &PublishTarget) -> Result<String, String> {
    if !safe_id(id) {
        return Err(warn_fields("githubPublishFailed", &[("detail", "song id cannot be a file name".into())]));
    }
    if token.trim().is_empty() {
        return Err(warn_code("githubTokenMissing"));
    }
    let mut score = abc.trim_end().to_owned();
    score.push('\n');
    let entry = IndexEntry {
        id: id.to_owned(),
        title: {
            let clean = title.trim();
            if clean.is_empty() { "未命名".into() } else { clean.to_owned() }
        },
        key: key_name(&score),
        updated: chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string(),
    };
    let client = crate::net::client();
    let message = commit_message(&entry.title);
    put_file(&client, token, target, &format!("scores/{id}.abc"), score.as_bytes(), &message).await?;
    let current = match read_file(&client, token, target, "scores/index.json").await? {
        Some((_, bytes)) => String::from_utf8_lossy(&bytes).into_owned(),
        None => "[]".into(),
    };
    let entries = merge_index(&current, entry)?;
    let mut index = serde_json::to_vec_pretty(&entries).map_err(|error| warn_fields("githubPublishFailed", &[("detail", error.to_string())]))?;
    index.push(b'\n');
    put_file(&client, token, target, "scores/index.json", &index, &message).await?;
    Ok(published_url(&target.site, id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_existing_id_is_replaced_and_titles_stay_sorted() {
        let current = r#"[{"id":"b","title":"Beta","key":"C","updated":"1"},{"id":"a","title":"Alpha","key":"G","updated":"1"}]"#;
        let merged = merge_index(current, IndexEntry {
            id: "a".into(),
            title: "Alpine".into(),
            key: "D".into(),
            updated: "2".into(),
        })
        .expect("merge");
        let ids: Vec<&str> = merged.iter().map(|entry| entry.id.as_str()).collect();
        assert_eq!(ids, ["a", "b"]);
        assert_eq!(merged[0].title, "Alpine");
        assert_eq!(merged[0].key, "D");
    }

    #[test]
    fn a_new_title_sorts_among_the_others() {
        let merged = merge_index("[]", IndexEntry { id: "c".into(), title: "Coda".into(), key: "C".into(), updated: "1".into() }).expect("merge");
        let again = merge_index(&serde_json::to_string(&merged).unwrap(), IndexEntry {
            id: "b".into(),
            title: "Bridge".into(),
            key: "F".into(),
            updated: "2".into(),
        })
        .expect("merge");
        let titles: Vec<&str> = again.iter().map(|entry| entry.title.as_str()).collect();
        assert_eq!(titles, ["Bridge", "Coda"]);
    }

    #[test]
    fn the_first_key_line_names_the_score() {
        assert_eq!(key_name("X:1\nT:湖岸\nK:G\nC2\n"), "G");
        assert_eq!(key_name("no key"), "C");
        assert!(safe_id("0199abcd-1234"));
        assert!(!safe_id("../index"));
        assert!(!safe_id(""));
    }

    #[test]
    fn a_bad_repo_is_refused_and_the_link_uses_the_site() {
        assert!(parse_target("../index", "master", DEFAULT_SITE).is_err());
        assert!(parse_target("a/b/c", "master", DEFAULT_SITE).is_err());
        assert!(parse_target("owner/repo", "mas ter", DEFAULT_SITE).is_err());
        assert!(parse_target("owner/repo", "master", "http://www.telesoho.com").is_err());
        assert!(parse_target("owner/repo", "master", "https://www.telesoho.com/jianpu").is_err());
        let target = parse_target("owner/repo", "master", "https://scores.example/").expect("target");
        assert_eq!(target.site, "https://scores.example");
        assert_eq!(published_url(&target.site, "song-1"), "https://scores.example/jianpu/#song-1");
        let bare = parse_target("owner/repo", "master", "telesoho.com").expect("bare host");
        assert_eq!(bare.site, "https://telesoho.com");
        assert!(parse_target("owner/repo", "master", "telesoho.com/jianpu").is_err());
    }
}
