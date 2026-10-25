//! Score-reading serials and the 7-day trial.
//!
//! The app only verifies. `license-gen` signs with a private key that is not
//! in this repo. A serial is `YUE2.` + base64url(version byte) + `.` +
//! base64url(Ed25519 signature).
//!
//! ponytail: deleting license.json restarts the 7 days. Online activation if that has to stop.

use std::{
    fs,
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

const PREFIX: &str = "YUE2";
const VERSION: u8 = 1;
const TRIAL_SECS: i64 = 7 * 24 * 60 * 60;
const DAY_SECS: i64 = 24 * 60 * 60;

/// Public half of the author's key, baked in from `license.pub`. The private half is `YUE_LICENSE_PRIV` for `license-gen`.
const PUBLIC_KEY: [u8; 32] = hex_key(include_str!("license.pub"));

const fn hex_key(text: &str) -> [u8; 32] {
    let bytes = text.as_bytes();
    let mut start = 0;
    while start < bytes.len() && bytes[start].is_ascii_whitespace() {
        start += 1;
    }
    let mut end = bytes.len();
    while end > start && bytes[end - 1].is_ascii_whitespace() {
        end -= 1;
    }
    assert!(end - start == 64, "license.pub must be 32 bytes of hex");
    let mut out = [0u8; 32];
    let mut index = 0;
    while index < 32 {
        out[index] = (hex_nibble(bytes[start + index * 2]) << 4)
            | hex_nibble(bytes[start + index * 2 + 1]);
        index += 1;
    }
    out
}

const fn hex_nibble(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        b'A'..=b'F' => byte - b'A' + 10,
        _ => panic!("license.pub is not hex"),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Gate {
    Licensed,
    Trial { days_left: i64 },
    Expired,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct Record {
    first_seen: i64,
    last_seen: i64,
    #[serde(default)]
    serial: String,
}

#[derive(Debug, Serialize)]
pub struct Status {
    pub licensed: bool,
    pub trial_days_left: i64,
    pub expired: bool,
    pub serial: String,
}

/// Records the first sight of this install. Called when the service starts.
pub fn note_seen() -> Result<(), String> {
    touch(unix_now()).map(|_| ())
}

/// Whether a new score reading may start.
pub fn allow_score_reading() -> Result<(), String> {
    let now = unix_now();
    let record = touch(now)?;
    match gate(
        now,
        record.first_seen,
        record.last_seen,
        verify(&record.serial),
    ) {
        Gate::Expired => Err("scoreLicenseExpired".into()),
        Gate::Licensed | Gate::Trial { .. } => Ok(()),
    }
}

pub fn status() -> Result<Status, String> {
    let now = unix_now();
    let record = touch(now)?;
    Ok(view(now, &record))
}

/// Stores a serial after it verifies. Anything else is refused and not written.
pub fn save(serial: &str) -> Result<Status, String> {
    let serial = serial.trim();
    if !verify(serial) {
        return Err("scoreLicenseInvalid".into());
    }
    let now = unix_now();
    let mut record = touch(now)?;
    record.serial = serial.to_string();
    write_record(&record)?;
    Ok(view(now, &record))
}

fn view(now: i64, record: &Record) -> Status {
    let decision = gate(
        now,
        record.first_seen,
        record.last_seen,
        verify(&record.serial),
    );
    Status {
        licensed: matches!(decision, Gate::Licensed),
        trial_days_left: match decision {
            Gate::Trial { days_left } => days_left,
            _ => 0,
        },
        expired: matches!(decision, Gate::Expired),
        serial: record.serial.clone(),
    }
}

fn gate(now: i64, first_seen: i64, last_seen: i64, licensed: bool) -> Gate {
    if licensed {
        return Gate::Licensed;
    }
    // A clock set backwards does not buy more trial.
    if now < last_seen {
        return Gate::Expired;
    }
    let remaining = first_seen.saturating_add(TRIAL_SECS).saturating_sub(now);
    if remaining <= 0 {
        Gate::Expired
    } else {
        Gate::Trial {
            days_left: (remaining + DAY_SECS - 1) / DAY_SECS,
        }
    }
}

fn verify(serial: &str) -> bool {
    let Ok(key) = VerifyingKey::from_bytes(&PUBLIC_KEY) else {
        return false;
    };
    verify_with(serial, &key)
}

fn verify_with(serial: &str, key: &VerifyingKey) -> bool {
    let mut parts = serial.trim().split('.');
    let (Some(prefix), Some(body_b64), Some(sig_b64), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return false;
    };
    if prefix != PREFIX {
        return false;
    }
    let Ok(body) = URL_SAFE_NO_PAD.decode(body_b64) else {
        return false;
    };
    let Ok(sig) = URL_SAFE_NO_PAD.decode(sig_b64) else {
        return false;
    };
    if body != [VERSION] {
        return false;
    }
    let Ok(sig) = Signature::from_slice(&sig) else {
        return false;
    };
    key.verify(&body, &sig).is_ok()
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs() as i64)
        .unwrap_or(0)
}

fn file_path() -> Option<std::path::PathBuf> {
    Some(crate::studio_data_root()?.join("license.json"))
}

fn touch(now: i64) -> Result<Record, String> {
    let path = file_path().ok_or_else(|| "no per-user application data directory".to_string())?;
    if path.exists() {
        let bytes = fs::read(&path).map_err(|error| error.to_string())?;
        let mut record: Record =
            serde_json::from_slice(&bytes).map_err(|_| "license file is unreadable".to_string())?;
        if now > record.last_seen {
            record.last_seen = now;
            write_record(&record)?;
        }
        return Ok(record);
    }
    let record = Record {
        first_seen: now,
        last_seen: now,
        serial: String::new(),
    };
    write_record(&record)?;
    Ok(record)
}

fn write_record(record: &Record) -> Result<(), String> {
    let path = file_path().ok_or_else(|| "no per-user application data directory".to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let bytes = serde_json::to_vec(record).map_err(|error| error.to_string())?;
    fs::write(&path, bytes).map_err(|error| format!("write {}: {error}", path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn issue(signing: &SigningKey) -> String {
        let body = [VERSION];
        let sig = signing.sign(&body);
        format!(
            "{PREFIX}.{}.{}",
            URL_SAFE_NO_PAD.encode(body),
            URL_SAFE_NO_PAD.encode(sig.to_bytes())
        )
    }

    #[test]
    fn a_signed_serial_verifies_and_a_changed_character_does_not() {
        let signing = SigningKey::from_bytes(&[7u8; 32]);
        let serial = issue(&signing);
        let key = signing.verifying_key();
        assert!(verify_with(&serial, &key));
        let mut chars = serial.into_bytes();
        let at = chars.len() - 1;
        chars[at] = if chars[at] == b'A' { b'B' } else { b'A' };
        assert!(!verify_with(&String::from_utf8(chars).unwrap(), &key));
    }

    #[test]
    fn day_six_allows_and_day_eight_does_not() {
        let first = 1_700_000_000;
        let day = DAY_SECS;
        assert_eq!(
            gate(first + 6 * day, first, first + 6 * day, false),
            Gate::Trial { days_left: 1 }
        );
        assert_eq!(
            gate(first + 7 * day, first, first + 7 * day, false),
            Gate::Expired
        );
        assert_eq!(
            gate(first + 8 * day, first, first + 8 * day, false),
            Gate::Expired
        );
    }

    #[test]
    fn a_clock_set_back_does_not_extend_the_trial() {
        let first = 1_700_000_000;
        let day = DAY_SECS;
        assert_eq!(
            gate(first + day, first, first + 3 * day, false),
            Gate::Expired
        );
        assert_eq!(
            gate(first + day, first, first + 3 * day, true),
            Gate::Licensed
        );
    }

    #[test]
    fn the_shipped_public_key_is_a_point() {
        assert!(VerifyingKey::from_bytes(&PUBLIC_KEY).is_ok());
    }
}
