import { describe, expect, it } from 'vitest';
import { classifyExternalDestination } from './external-destinations';

describe('classifyExternalDestination', () => {
  it.each([
    ['https://x.com/user/status/123?ref=share', 'X'],
    ['https://twitter.com/user/status/123', 'X'],
    ['https://discord.com/channels/123/456/789', 'Discord'],
    ['https://discordapp.com/channels/123/456', 'Discord'],
    ['https://www.google.com/maps/place/Somewhere', 'Maps'],
    ['https://maps.google.com/?q=Somewhere', 'Maps'],
    ['https://www.openstreetmap.org/#map=12/1/2', 'Maps'],
    ['https://www.openstreetmap.org/search?query=Somewhere', 'Maps'],
  ] as const)('%s classifies as %s without rewriting its URL', (url, kind) => {
    expect(classifyExternalDestination(url)).toEqual({
      kind,
      url,
      actionLabel: `Open in ${kind}`,
    });
  });

  it.each([
    'https://x.com/ordinary-profile',
    'https://discord.com/invite/abc',
    'https://social.example/post/1',
    'https://x.com.evil.test/user/status/1',
    'https://discord.com.evil.test/channels/1/2',
    'https://maps.google.com/maps',
    'https://www.google.com/maps',
    'https://x.com:8443/user/status/123',
    'https://openstreetmap.org/#map=12/not-a-location',
    'https://user:pass@x.com/user/status/1',
    'https://maps.google.com/',
    'https://www.google.com/maps',
    'https://openstreetmap.org/#map=12/not-a-location',
    'javascript:alert(1)',
    'data:text/html,hello',
    'not a URL',
    'https://www.google.com/maps/place/',
    'https://www.google.com/maps/dir/',
    'https://www.google.com/maps/search/',
  ])('%s is not trusted', (url) => {
    expect(classifyExternalDestination(url)).toBeUndefined();
  });
});
