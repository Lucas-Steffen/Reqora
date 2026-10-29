//! Writes JSON exactly as `JSON.stringify(value, null, 2)` does, so a file
//! saved by the Rust store has the same bytes as one saved by the Electron
//! store. serde_json's pretty printer and string escaping already match;
//! only numbers (`1.0` vs `1`, `0.0000001` vs `1e-7`, `1e21` vs `1e+21`) and
//! the order of integer-like keys differ, so numbers go through the ECMAScript
//! Number-to-String rules and keys through [`js_key_order`].

use serde::Serialize;
use serde_json::Value;
use serde_json::ser::{Formatter, PrettyFormatter};
use std::io::{self, Write};

/// ECMAScript `Number.prototype.toString()` for a finite double.
pub fn js_number(value: f64) -> String {
    if !value.is_finite() {
        return "null".into();
    }
    if value == 0.0 {
        return "0".into(); // also -0
    }
    // `{:e}` gives the shortest digits that round-trip, as JS does.
    let scientific = format!("{:e}", value.abs());
    let (mantissa, exponent) = scientific.split_once('e').expect("exponent");
    let digits: String = mantissa.chars().filter(|c| *c != '.').collect();
    let k = digits.len() as i32;
    let n = exponent.parse::<i32>().expect("exponent") + 1;
    let mut out = String::new();
    if value < 0.0 {
        out.push('-');
    }
    if k <= n && n <= 21 {
        out.push_str(&digits);
        out.extend(std::iter::repeat('0').take((n - k) as usize));
    } else if 0 < n && n <= 21 {
        out.push_str(&digits[..n as usize]);
        out.push('.');
        out.push_str(&digits[n as usize..]);
    } else if -6 < n && n <= 0 {
        out.push_str("0.");
        out.extend(std::iter::repeat('0').take((-n) as usize));
        out.push_str(&digits);
    } else {
        out.push_str(&digits[..1]);
        if k > 1 {
            out.push('.');
            out.push_str(&digits[1..]);
        }
        let e = n - 1;
        out.push('e');
        out.push(if e < 0 { '-' } else { '+' });
        out.push_str(&e.abs().to_string());
    }
    out
}

/// Whether `key` is an array index, which a JS object lists first, in numeric order.
fn is_array_index(key: &str) -> bool {
    let bytes = key.as_bytes();
    if bytes.is_empty() || bytes.len() > 10 || !bytes.iter().all(u8::is_ascii_digit) || (bytes[0] == b'0' && bytes.len() > 1) {
        return false;
    }
    key.parse::<u64>().is_ok_and(|index| index < u32::MAX as u64)
}

/// Reorders object keys the way a JS object holds them: array indices first in
/// ascending order, then the other keys in insertion order. Objects without
/// index keys are left untouched.
pub fn js_key_order(value: &mut Value) {
    match value {
        Value::Array(items) => items.iter_mut().for_each(js_key_order),
        Value::Object(map) => {
            map.values_mut().for_each(js_key_order);
            if map.keys().any(|key| is_array_index(key)) {
                let mut entries: Vec<(String, Value)> = std::mem::take(map).into_iter().collect();
                // A stable sort, so the other keys keep their order.
                entries.sort_by_key(|(key, _)| if is_array_index(key) { (0, key.parse::<u64>().unwrap_or(0)) } else { (1, 0) });
                map.extend(entries);
            }
        }
        _ => {}
    }
}

/// `PrettyFormatter` with two-space indent and JS number output.
struct JsFormatter(PrettyFormatter<'static>);

impl Formatter for JsFormatter {
    fn write_i64<W: ?Sized + Write>(&mut self, writer: &mut W, value: i64) -> io::Result<()> {
        // JS holds every number as a double, so integers past 2^53 round.
        writer.write_all(js_number(value as f64).as_bytes())
    }

    fn write_u64<W: ?Sized + Write>(&mut self, writer: &mut W, value: u64) -> io::Result<()> {
        writer.write_all(js_number(value as f64).as_bytes())
    }

    fn write_f64<W: ?Sized + Write>(&mut self, writer: &mut W, value: f64) -> io::Result<()> {
        writer.write_all(js_number(value).as_bytes())
    }

    fn begin_array<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.0.begin_array(writer)
    }

    fn end_array<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.0.end_array(writer)
    }

    fn begin_array_value<W: ?Sized + Write>(&mut self, writer: &mut W, first: bool) -> io::Result<()> {
        self.0.begin_array_value(writer, first)
    }

    fn end_array_value<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.0.end_array_value(writer)
    }

    fn begin_object<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.0.begin_object(writer)
    }

    fn end_object<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.0.end_object(writer)
    }

    fn begin_object_key<W: ?Sized + Write>(&mut self, writer: &mut W, first: bool) -> io::Result<()> {
        self.0.begin_object_key(writer, first)
    }

    fn begin_object_value<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.0.begin_object_value(writer)
    }

    fn end_object_value<W: ?Sized + Write>(&mut self, writer: &mut W) -> io::Result<()> {
        self.0.end_object_value(writer)
    }
}

/// The bytes of `JSON.stringify(value, null, 2)`.
pub fn to_js_pretty<T: Serialize + ?Sized>(value: &T) -> serde_json::Result<Vec<u8>> {
    let mut out = Vec::new();
    let mut serializer = serde_json::Serializer::with_formatter(&mut out, JsFormatter(PrettyFormatter::with_indent(b"  ")));
    value.serialize(&mut serializer)?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn numbers_print_as_in_javascript() {
        let cases: &[(f64, &str)] = &[
            (0.0, "0"),
            (-0.0, "0"),
            (1.0, "1"),
            (-0.5, "-0.5"),
            (0.1, "0.1"),
            (123.456, "123.456"),
            (1e-7, "1e-7"),
            (0.000001, "0.000001"),
            (1.5e-7, "1.5e-7"),
            (1e20, "100000000000000000000"),
            (1e21, "1e+21"),
            (1.25e21, "1.25e+21"),
            (5e-324, "5e-324"),
            (f64::MAX, "1.7976931348623157e+308"),
            (9007199254740993.0, "9007199254740992"),
        ];
        for (value, expected) in cases {
            assert_eq!(js_number(*value), *expected, "{value:?}");
        }
        assert_eq!(js_number(f64::NAN), "null");
    }

    #[test]
    fn index_keys_come_first_as_in_javascript() {
        let mut value: Value = serde_json::from_str(r#"{"b":1,"10":2,"2":3,"a":{"z":0,"0":1},"01":4,"4294967295":5,"4294967294":6}"#).unwrap();
        js_key_order(&mut value);
        assert_eq!(value.to_string(), r#"{"2":3,"10":2,"4294967294":6,"b":1,"a":{"0":1,"z":0},"01":4,"4294967295":5}"#);
    }

    #[test]
    fn pretty_output_matches_stringify() {
        // x, U+2028 (kept raw by JSON.stringify), a quote, a backslash and U+0001.
        let value = json!({ "a": [], "b": {}, "c": [1, 2.5, "x\u{2028}\"\\\u{1}"], "d": { "e": null, "f": true } });
        let text = String::from_utf8(to_js_pretty(&value).unwrap()).unwrap();
        let expected = r#"{
  "a": [],
  "b": {},
  "c": [
    1,
    2.5,
    "x_LS_\"\\\u0001"
  ],
  "d": {
    "e": null,
    "f": true
  }
}"#
        .replace("_LS_", "\u{2028}");
        assert_eq!(text, expected);
    }
}
