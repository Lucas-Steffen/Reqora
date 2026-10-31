//! Secrets on the way out (ADR-010). The WebView prepares the request with
//! placeholders (`rqs_<32 hex>_<i>`) where secret values go; here each one is
//! replaced by the value, encoded the way its position needs, and the real
//! values are masked out of whatever comes back.

use super::{Body, Prepared};

/// What `redact` writes over a secret.
pub const MASK: &str = "••••••";

/// `rqs_` + 128-bit nonce in hex + `_` + index; letters, digits and `_` only,
/// so `encodeURIComponent` and `URLSearchParams` leave it as it is.
pub fn is_placeholder(text: &str) -> bool {
    let Some(rest) = text.strip_prefix("rqs_") else { return false };
    let Some((nonce, index)) = rest.split_once('_') else { return false };
    nonce.len() == 32
        && nonce.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
        && !index.is_empty()
        && index.bytes().all(|byte| byte.is_ascii_digit())
}

/// `encodeURIComponent`.
pub fn encode_uri_component(value: &str) -> String {
    percent_encode(value, |byte| byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte), false)
}

/// The `application/x-www-form-urlencoded` serializer of `URLSearchParams`.
pub fn encode_form(value: &str) -> String {
    percent_encode(value, |byte| byte.is_ascii_alphanumeric() || b"*-._".contains(&byte), true)
}

fn percent_encode(value: &str, keep: impl Fn(u8) -> bool, space_as_plus: bool) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if keep(byte) {
            out.push(byte as char);
        } else if space_as_plus && byte == b' ' {
            out.push('+');
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

fn replace_all(text: &str, values: &[(String, String)], encode: impl Fn(&str) -> String) -> String {
    values.iter().fold(text.to_owned(), |text, (placeholder, value)| text.replace(placeholder.as_str(), &encode(value)))
}

/// The request with every placeholder replaced: encoded in the URL, as form
/// data in an urlencoded body, raw everywhere else.
pub fn substitute(request: &Prepared, values: &[(String, String)]) -> Prepared {
    let raw = |value: &str| value.to_owned();
    let urlencoded = request.headers.iter().any(|(name, value)| {
        name.trim().eq_ignore_ascii_case("content-type")
            && value.trim().to_ascii_lowercase().starts_with("application/x-www-form-urlencoded")
    });
    Prepared {
        method: request.method.clone(),
        url: replace_all(&request.url, values, encode_uri_component),
        headers: request.headers.iter().map(|(name, value)| (replace_all(name, values, raw), replace_all(value, values, raw))).collect(),
        body: request.body.as_ref().map(|body| match body {
            Body::Text { text } if urlencoded => Body::Text { text: replace_all(text, values, encode_form) },
            Body::Text { text } => Body::Text { text: replace_all(text, values, raw) },
            Body::FormData { fields } => Body::FormData {
                fields: fields.iter().map(|(name, value)| (replace_all(name, values, raw), replace_all(value, values, raw))).collect(),
            },
        }),
    }
}

/// `redact`: the longest value first, so one that contains another is masked whole.
pub fn mask(text: &str, secrets: &[String]) -> String {
    let mut sorted: Vec<&String> = secrets.iter().filter(|secret| !secret.is_empty()).collect();
    sorted.sort_by_key(|value| std::cmp::Reverse(value.len()));
    sorted.into_iter().fold(text.to_owned(), |text, secret| text.replace(secret.as_str(), MASK))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn placeholder(index: usize) -> String {
        format!("rqs_{}_{index}", "0123456789abcdef".repeat(2))
    }

    #[test]
    fn recognizes_only_well_formed_placeholders() {
        assert!(is_placeholder(&placeholder(0)));
        assert!(is_placeholder(&placeholder(12)));
        for text in ["rqs_abc_0", &format!("rqs_{}_", "a".repeat(32)), &format!("rqs_{}_x", "a".repeat(32)), &format!("rqs_{}_1", "A".repeat(32)), "{{token}}"] {
            assert!(!is_placeholder(text), "{text}");
        }
    }

    #[test]
    fn encodes_like_encode_uri_component_and_url_search_params() {
        assert_eq!(encode_uri_component("a b&c=d/é!*'()~"), "a%20b%26c%3Dd%2F%C3%A9!*'()~");
        assert_eq!(encode_form("a b&c=d/é!*~"), "a+b%26c%3Dd%2F%C3%A9%21*%7E");
    }

    #[test]
    fn substitutes_by_position() {
        let (token, value) = (placeholder(0), "p@ss word&x".to_owned());
        let request = Prepared {
            method: "POST".into(),
            url: format!("https://api.test/items?key={token}"),
            headers: vec![("Authorization".into(), format!("Bearer {token}")), ("Content-Type".into(), "application/x-www-form-urlencoded; charset=utf-8".into())],
            body: Some(Body::Text { text: format!("secret={token}") }),
        };
        let values = vec![(token.clone(), value.clone())];
        let sent = substitute(&request, &values);
        assert_eq!(sent.url, "https://api.test/items?key=p%40ss%20word%26x");
        assert_eq!(sent.headers[0].1, "Bearer p@ss word&x");
        assert_eq!(sent.body, Some(Body::Text { text: "secret=p%40ss+word%26x".into() }));

        let json = Prepared { headers: vec![("content-type".into(), "application/json".into())], body: Some(Body::Text { text: format!("{{\"k\":\"{token}\"}}") }), ..request.clone() };
        assert_eq!(substitute(&json, &values).body, Some(Body::Text { text: "{\"k\":\"p@ss word&x\"}".into() }));

        let form = Prepared { body: Some(Body::FormData { fields: vec![("f".into(), token.clone())] }), ..request };
        assert_eq!(substitute(&form, &values).body, Some(Body::FormData { fields: vec![("f".into(), value)] }));
    }

    #[test]
    fn a_variable_inside_a_secret_stays_literal() {
        // Accepted difference (ADR-010): the Electron runner resolved `{{var}}` inside a secret value.
        let token = placeholder(0);
        let request = Prepared { method: "GET".into(), url: "https://api.test/".into(), headers: vec![("X-Key".into(), token.clone())], body: None };
        assert_eq!(substitute(&request, &[(token, "{{host}}".into())]).headers[0].1, "{{host}}");
    }

    #[test]
    fn masks_the_longest_value_first() {
        let secrets = vec!["abc".to_owned(), "abcdef".to_owned(), String::new()];
        assert_eq!(mask("x abcdef y abc", &secrets), format!("x {MASK} y {MASK}"));
        assert_eq!(mask("nothing here", &secrets), "nothing here");
    }
}
