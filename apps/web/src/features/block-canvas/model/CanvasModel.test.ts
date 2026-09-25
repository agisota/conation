import { describe, expect, it } from 'vitest';
import { validateCanvasImport } from './CanvasModel';

function linkBoard(url: string): string {
  return JSON.stringify({
    nodes: [
      {
        id: 'link-1',
        type: 'link',
        x: 0,
        y: 0,
        width: 100,
        height: 32,
        edges: [],
        url,
      },
    ],
    edges: [],
  });
}

describe('Canvas import validation', () => {
  it.each(['http://example.com/board', 'https://example.com/board'])(
    'preserves supported link URL %s',
    (url) => {
      const json = linkBoard(url);

      expect(JSON.parse(validateCanvasImport(json)).nodes[0].url).toBe(url);
    }
  );

  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'ftp://example.com/board',
  ])('rejects unsafe link URL %s', (url) => {
    expect(() => validateCanvasImport(linkBoard(url))).toThrow();
  });
});
