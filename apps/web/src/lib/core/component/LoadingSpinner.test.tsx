import { cleanup, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  afterEach(cleanup);

  it('renders the canonical Conation app mark as a decorative loader', () => {
    render(() => <LoadingSpinner />);

    const mark = screen.getByRole('presentation');
    expect(mark.getAttribute('src')).toContain(
      '/brand/conation-app-icon-master-v1.png'
    );
    expect(mark.getAttribute('alt')).toBe('');
    expect(mark.className).toContain('animate-pulse');
  });
});
