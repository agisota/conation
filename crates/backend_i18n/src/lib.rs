#![deny(missing_docs)]
//! Locale negotiation and localized rendering shared by backend delivery paths.
//!
//! English is the source and fallback locale. Transport adapters are responsible
//! for extracting an `Accept-Language` value and passing it to
//! [`negotiate_accept_language`]; this crate has no HTTP dependency.

mod locale;
mod verification_email;

pub use locale::{SupportedLocale, negotiate_accept_language, parse_stored_locale};
pub use verification_email::{
    RenderedVerificationEmail, VerificationEmail, render_verification_email,
};
