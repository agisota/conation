#[cfg(test)]
mod test;

use std::fmt;

/// A locale for which backend-authored content has a complete catalog.
#[derive(Clone, Copy, Debug, Default, Eq, Hash, PartialEq)]
pub enum SupportedLocale {
    /// English, the source-catalog fallback locale.
    English,
    /// Russian, the default product locale.
    #[default]
    Russian,
}

impl SupportedLocale {
    /// Returns the locale's canonical BCP 47 language tag.
    #[must_use]
    pub const fn language_tag(self) -> &'static str {
        match self {
            Self::English => "en",
            Self::Russian => "ru",
        }
    }
}

impl fmt::Display for SupportedLocale {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.language_tag())
    }
}

/// Negotiates English or Russian from an optional `Accept-Language` field value.
///
/// Quality weights and source order are honored, regional tags fall back to
/// their primary language, and ranges with `q=0` are excluded. Invalid,
/// unsupported, wildcard-only, absent, or otherwise unresolvable values fall
/// back to the Russian product default.
#[must_use]
pub fn negotiate_accept_language(value: Option<&str>) -> SupportedLocale {
    let Some(value) = value else {
        return SupportedLocale::default();
    };

    let mut best: Option<(u16, SupportedLocale)> = None;

    for item in value.split(',') {
        let Some((locale, quality)) = parse_item(item) else {
            continue;
        };

        if quality == 0 {
            continue;
        }

        if best.is_none_or(|(best_quality, _)| quality > best_quality) {
            best = Some((quality, locale));
        }
    }

    best.map_or_else(SupportedLocale::default, |(_, locale)| locale)
}

fn parse_item(item: &str) -> Option<(SupportedLocale, u16)> {
    let mut parts = item.trim().split(';');
    let range = parts.next()?.trim();
    let locale = parse_language_range(range)?;
    let mut quality = 1_000;

    if let Some(parameter) = parts.next() {
        let (name, value) = parameter.trim().split_once('=')?;
        if !name.trim().eq_ignore_ascii_case("q") {
            return None;
        }
        quality = parse_quality(value.trim())?;
    }

    if parts.next().is_some() {
        return None;
    }

    Some((locale, quality))
}

fn parse_language_range(range: &str) -> Option<SupportedLocale> {
    if range.is_empty() {
        return None;
    }
    if range == "*" {
        return Some(SupportedLocale::default());
    }

    let mut subtags = range.split('-');
    let primary = subtags.next()?;
    if !valid_subtag(primary, true) || !subtags.all(|subtag| valid_subtag(subtag, false)) {
        return None;
    }

    if primary.eq_ignore_ascii_case("en") {
        Some(SupportedLocale::English)
    } else if primary.eq_ignore_ascii_case("ru") {
        Some(SupportedLocale::Russian)
    } else {
        None
    }
}

fn valid_subtag(subtag: &str, alphabetic_only: bool) -> bool {
    !subtag.is_empty()
        && subtag.len() <= 8
        && if alphabetic_only {
            subtag.bytes().all(|byte| byte.is_ascii_alphabetic())
        } else {
            subtag.bytes().all(|byte| byte.is_ascii_alphanumeric())
        }
}

fn parse_quality(value: &str) -> Option<u16> {
    if value == "0" {
        return Some(0);
    }
    if value == "1" {
        return Some(1_000);
    }

    let (whole, fractional) = value.split_once('.')?;
    if fractional.len() > 3 || !fractional.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }

    match whole {
        "0" => {
            let mut thousandths = 0;
            for (index, byte) in fractional.bytes().enumerate() {
                thousandths += u16::from(byte - b'0') * 10_u16.pow(2 - index as u32);
            }
            Some(thousandths)
        }
        "1" if fractional.bytes().all(|byte| byte == b'0') => Some(1_000),
        _ => None,
    }
}
