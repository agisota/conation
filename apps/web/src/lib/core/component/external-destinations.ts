/** Recognized, user-initiated external destinations. Classification makes no network requests. */
export type ExternalDestinationKind = 'X' | 'Discord' | 'Maps';

export type ExternalDestination = {
  kind: ExternalDestinationKind;
  url: string;
  actionLabel: `Open in ${ExternalDestinationKind}`;
};

/** Classifies canonical HTTPS conversation/place URLs while preserving the exact input URL. */
export function classifyExternalDestination(
  value: string
): ExternalDestination | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return;
    const host = url.hostname.toLowerCase();
    let kind: ExternalDestinationKind | undefined;

    if (
      (host === 'x.com' ||
        host === 'www.x.com' ||
        host === 'twitter.com' ||
        host === 'www.twitter.com') &&
      /^\/(?:[^/]+\/status\/[1-9]\d*|i\/spaces\/[^/]+)\/?$/.test(url.pathname)
    ) {
      kind = 'X';
    } else if (
      (host === 'discord.com' ||
        host === 'www.discord.com' ||
        host === 'discordapp.com' ||
        host === 'www.discordapp.com') &&
      /^\/channels\/\d+\/\d+(?:\/\d+)?\/?$/.test(url.pathname)
    ) {
      kind = 'Discord';
    } else if (
      (host === 'maps.google.com' ||
        host === 'www.google.com' ||
        host === 'google.com') &&
      (/^\/maps\/(?:place|dir|search)\/.+/.test(url.pathname) ||
        (/^\/maps\/(?:place|dir|search)\/?$/.test(url.pathname) &&
          (url.searchParams.has('q') ||
            url.searchParams.has('query') ||
            url.searchParams.has('daddr') ||
            url.searchParams.has('destination'))) ||
        (host === 'maps.google.com' &&
          /^\/$/.test(url.pathname) &&
          (url.searchParams.has('q') || url.searchParams.has('query'))) ||
        (/^\/maps\/?$/.test(url.pathname) &&
          (url.searchParams.has('q') ||
            url.searchParams.has('query') ||
            url.searchParams.has('daddr') ||
            url.searchParams.has('destination'))))
    ) {
      kind = 'Maps';
    } else if (
      (host === 'openstreetmap.org' || host === 'www.openstreetmap.org') &&
      (/^#map=\d+\/-?\d+(?:\.\d+)?\/-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?(?:&layers=[^&]+)?$/.test(
        url.hash
      ) ||
        (/^\/search\/?$/.test(url.pathname) && url.searchParams.has('query')))
    ) {
      kind = 'Maps';
    }

    return kind
      ? { kind, url: value, actionLabel: `Open in ${kind}` }
      : undefined;
  } catch {
    return undefined;
  }
}
