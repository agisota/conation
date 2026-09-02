export const LOCAL_FUSIONAUTH_ORIGIN = "http://localhost:9011";
const LEGACY_MANAGED_HOST_SUFFIXES = ["macro.com", "macroverse.workers.dev"];

function isLegacyManagedHost(hostname: string): boolean {
  return LEGACY_MANAGED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

/**
 * Resolves the FusionAuth origin used by local developer tooling.
 *
 * The local self-hosted FusionAuth service is the only fallback. An operator
 * must set FUSIONAUTH_DOMAIN explicitly for any non-local environment.
 */
export function resolveFusionAuthOrigin(
  configuredOrigin = process.env.FUSIONAUTH_DOMAIN
): string {
  const rawOrigin = configuredOrigin?.trim() || LOCAL_FUSIONAUTH_ORIGIN;
  let parsed: URL;

  try {
    parsed = new URL(rawOrigin);
  } catch {
    throw new Error(
      "FUSIONAUTH_DOMAIN must be an absolute http(s) origin, for example https://auth.conation.example"
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("FUSIONAUTH_DOMAIN must use http or https");
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "FUSIONAUTH_DOMAIN must be an origin without credentials, path, query, or fragment"
    );
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isLegacyManagedHost(hostname)) {
    throw new Error(
      `FUSIONAUTH_DOMAIN cannot target managed legacy host ${hostname}`
    );
  }

  return parsed.origin;
}

export async function generateAccessToken(
  fusionAuthOrigin = resolveFusionAuthOrigin(),
  refreshToken = process.env.REFRESH_TOKEN
): Promise<string> {

  if (!refreshToken) {
    throw new Error("REFRESH_TOKEN environment variable is not set");
  }

  const response = await fetch(`${fusionAuthOrigin}/api/jwt/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: "garbage", // we only need to pass in a valid refresh token to FA
      refreshToken: refreshToken,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to generate access token: ${response.status} ${response.statusText}\n${errorText}`
    );
  }

  const data = await response.json();

  if (!data.token) {
    throw new Error("Response did not contain a token");
  }

  return data.token;
}

if (import.meta.main) {
  const token = await generateAccessToken();
  console.log("Access Token:");
  console.log(token);
}
