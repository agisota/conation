/// The name of the cookie that contains the JWT access token
pub static CONATION_ACCESS_TOKEN_COOKIE: &str = "conation-access-token";
/// The name of the cookie that contains the JWT refresh token.
pub static CONATION_REFRESH_TOKEN_COOKIE: &str = "conation-refresh-token";
/// The header that carries a JWT refresh token for non-cookie clients.
pub static CONATION_REFRESH_TOKEN_HEADER: &str = "x-conation-refresh-token";
