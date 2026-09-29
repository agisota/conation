import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationTimePicker } from './AutomationTimePicker';

afterEach(cleanup);

vi.mock('@core/directive/clickOutside', () => ({
  default: () => {},
}));
vi.mock('@core/component/AI/constant', () => ({
  DEFAULT_MODEL: 'claude-sonnet-4-6',
}));
vi.mock('@core/constant/allBlocks', () => ({
  blockNameToDefaultFile: () => 'New automation',
}));
vi.mock('@ui', () => ({ cn: (...classes: string[]) => classes.join(' ') }));

function mountPicker(initialValue = '09:00') {
  const emitted: string[] = [];
  const [value, setValue] = createSignal(initialValue);
  render(() => (
    <AutomationTimePicker
      value={value()}
      onChange={(nextValue) => {
        emitted.push(nextValue);
        setValue(nextValue);
      }}
    />
  ));
  fireEvent.click(screen.getByRole('button'));
  return {
    emitted,
    minute: screen.getByRole('textbox', { name: 'Minute' }) as HTMLInputElement,
    hour: screen.getByRole('textbox', { name: 'Hour' }) as HTMLInputElement,
    setValue,
  };
}

describe('AutomationTimePicker controlled value', () => {
  it('keeps a typed first minute digit through the parent echo so the next digit commits 09:30', () => {
    const { minute, emitted } = mountPicker();

    fireEvent.input(minute, { target: { value: '3' } });
    expect(minute.value).toBe('3');
    fireEvent.input(minute, { target: { value: '30' } });

    expect(emitted).toEqual(['09:03', '09:30']);
  });
  it('keeps partial input when the parent delivers its canonical echo later', () => {
    const [value, setValue] = createSignal('09:00');
    const emitted: string[] = [];
    render(() => (
      <AutomationTimePicker
        value={value()}
        onChange={(nextValue) => emitted.push(nextValue)}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: /^9:00 AM$/i }));
    const minute = screen.getByRole('textbox', { name: 'Minute' });
    fireEvent.input(minute, { target: { value: '3' } });
    expect(minute).toHaveProperty('value', '3');

    setValue(emitted[0]);

    expect(minute).toHaveProperty('value', '3');
  });

  it('keeps minute deletion, including an empty raw value, through parent echoes', () => {
    const { minute } = mountPicker('09:30');

    fireEvent.input(minute, { target: { value: '3' } });
    expect(minute.value).toBe('3');
    fireEvent.input(minute, { target: { value: '' } });

    expect(minute.value).toBe('');
  });

  it('pads a partial minute on blur', () => {
    const { minute } = mountPicker();

    fireEvent.input(minute, { target: { value: '5' } });
    fireEvent.blur(minute);
    expect(minute.value).toBe('05');
  });

  it('lets a distinct external value replace an unacknowledged local commit', () => {
    const emitted: string[] = [];
    const [value, setValue] = createSignal('09:00');
    render(() => (
      <AutomationTimePicker
        value={value()}
        onChange={(nextValue) => emitted.push(nextValue)}
      />
    ));
    fireEvent.click(screen.getByRole('button', { name: /^9:00 AM$/i }));
    const minute = screen.getByRole('textbox', {
      name: 'Minute',
    }) as HTMLInputElement;
    fireEvent.input(minute, { target: { value: '3' } });
    expect(emitted).toEqual(['09:03']);

    setValue('23:45');

    expect(screen.getByRole('textbox', { name: 'Hour' })).toHaveProperty(
      'value',
      '11'
    );
    expect(minute.value).toBe('45');
    fireEvent.input(minute, { target: { value: '46' } });
    expect(emitted).toEqual(['09:03', '23:46']);
  });

  it('does not emit invalid minute values or restore them before a genuine external change', () => {
    const { minute, emitted, setValue } = mountPicker();

    fireEvent.input(minute, { target: { value: '60' } });
    expect(minute.value).toBe('60');
    expect(emitted).toEqual([]);
    fireEvent.input(minute, { target: { value: '5x' } });
    expect(minute.value).toBe('5x');
    expect(emitted).toEqual([]);
    setValue('11:45');

    expect(minute.value).toBe('45');
    expect(emitted).toEqual([]);
  });

  it('handles a same-value parent echo before a second digit', () => {
    const { minute, emitted } = mountPicker();

    fireEvent.input(minute, { target: { value: '0' } });
    expect(minute.value).toBe('0');
    fireEvent.input(minute, { target: { value: '03' } });

    expect(minute.value).toBe('03');
    expect(emitted).toEqual(['09:00', '09:03']);
  });

  it('keeps hour and period edits canonical', () => {
    const { hour, emitted } = mountPicker();

    fireEvent.input(hour, { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'PM' }));

    expect(emitted).toEqual(['10:00', '22:00']);
  });
});
