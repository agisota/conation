import { afterEach, describe, expect, it, vi } from 'vitest';

const span = vi.hoisted(() => ({
  setAttr: vi.fn(),
  event: vi.fn(),
  error: vi.fn(),
  end: vi.fn(),
  run: vi.fn(<T>(operation: () => T) => operation()),
  span: vi.fn(),
}));

vi.mock('@macro-inc/observability', () => ({
  Telemetry: { span: vi.fn(() => span) },
}));

import { Telemetry } from '@macro-inc/observability';
import { SessionLoadTrace } from './load-telemetry';

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('SessionLoadTrace.wrap', () => {
  it('invokes void and null callbacks once with a span', () => {
    const trace = new SessionLoadTrace('session-1');
    for (const value of [undefined, null]) {
      const operation = vi.fn(() => value);
      expect(trace.wrap(operation)).toBe(value);
      expect(operation).toHaveBeenCalledOnce();
    }
    trace.end('loaded');
  });

  it('invokes value and promise callbacks once with a span', async () => {
    const trace = new SessionLoadTrace('session-1');
    const valueOperation = vi.fn(() => 'loaded');
    expect(trace.wrap(valueOperation)).toBe('loaded');
    expect(valueOperation).toHaveBeenCalledOnce();
    const promiseOperation = vi.fn(() => Promise.resolve('loaded'));
    await expect(trace.wrap(promiseOperation)).resolves.toBe('loaded');
    expect(promiseOperation).toHaveBeenCalledOnce();
    trace.end('loaded');
  });

  it('invokes nullish callbacks once without a span', () => {
    vi.mocked(Telemetry.span).mockReturnValueOnce(undefined as never);
    const trace = new SessionLoadTrace('session-1');
    for (const value of [undefined, null]) {
      const operation = vi.fn(() => value);
      expect(trace.wrap(operation)).toBe(value);
      expect(operation).toHaveBeenCalledOnce();
    }
    trace.end('loaded');
  });

  it('falls back once if context activation fails before invocation', () => {
    span.run.mockImplementationOnce(() => {
      throw new Error('context activation failed');
    });
    const trace = new SessionLoadTrace('session-1');
    const operation = vi.fn(() => undefined);
    expect(trace.wrap(operation)).toBeUndefined();
    expect(operation).toHaveBeenCalledOnce();
    trace.end('loaded');
  });
});
