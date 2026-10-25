//! Issues YuE2 score-reading serials. Not part of the installed app.
//!
//! The private key stays in the file named by `YUE_LICENSE_PRIV`, outside this
//! repo. The first run creates that file and prints the public-key hex to
//! write into `music-server`'s `license.pub`. Later runs print one serial.
//!
//! Serial format, same as `crates/music-server/src/license.rs`:
//! `YUE2.` + base64url(version byte) + `.` + base64url(Ed25519 signature).

use std::{env, fs, path::Path, process::ExitCode};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signer, SigningKey};
use rand::rngs::OsRng;

const VERSION: u8 = 1;

fn main() -> ExitCode {
    let Some(path) = env::var_os("YUE_LICENSE_PRIV").filter(|path| !path.is_empty()) else {
        eprintln!("set YUE_LICENSE_PRIV to a private-key file outside this repo");
        return ExitCode::from(2);
    };
    let path = Path::new(&path);
    // None: the key file was just created and the public key was printed.
    let signing = match load_or_create(path) {
        Ok(Some(key)) => key,
        Ok(None) => return ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            return ExitCode::from(1);
        }
    };
    let body = [VERSION];
    let sig = signing.sign(&body);
    println!(
        "YUE2.{}.{}",
        URL_SAFE_NO_PAD.encode(body),
        URL_SAFE_NO_PAD.encode(sig.to_bytes())
    );
    ExitCode::SUCCESS
}

/// `Ok(None)` when the key file was just created.
fn load_or_create(path: &Path) -> Result<Option<SigningKey>, String> {
    if path.exists() {
        let text = fs::read_to_string(path)
            .map_err(|error| format!("read {}: {error}", path.display()))?;
        let bytes = decode_hex(text.trim())
            .ok_or_else(|| format!("{} is not 32 bytes of hex", path.display()))?;
        return Ok(Some(SigningKey::from_bytes(&bytes)));
    }
    let signing = SigningKey::generate(&mut OsRng);
    if let Some(parent) = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
    {
        fs::create_dir_all(parent)
            .map_err(|error| format!("create {}: {error}", parent.display()))?;
    }
    let secret = signing.to_bytes();
    fs::write(path, encode_hex(&secret))
        .map_err(|error| format!("write {}: {error}", path.display()))?;
    let public = signing.verifying_key().to_bytes();
    println!("wrote {}", path.display());
    println!("write this line to crates/music-server/src/license.pub and rebuild:");
    println!("{}", encode_hex(&public));
    Ok(None)
}

fn encode_hex(bytes: &[u8]) -> String {
    const HEX: &[u8] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0xf) as usize] as char);
    }
    out
}

fn decode_hex(text: &str) -> Option<[u8; 32]> {
    if text.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (index, byte) in out.iter_mut().enumerate() {
        *byte = u8::from_str_radix(text.get(index * 2..index * 2 + 2)?, 16).ok()?;
    }
    Some(out)
}
