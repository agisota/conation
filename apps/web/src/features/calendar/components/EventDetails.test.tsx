import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '../types';
import { DEFAULT_CALENDAR_SOURCE } from '../types';

const open = vi.hoisted(() => vi.fn());
vi.mock('@core/util/url', async (original) => ({
  ...(await original<typeof import('@core/util/url')>()),
  openExternalUrl: open,
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { send() {}, addEventListener() {}, removeEventListener() {} },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect() {},
  createConnectionWebsocketEffect() {},
  parseWebsocketPayload: () => undefined,
}));
vi.mock('@service-storage/websocket', () => ({
  storageWS: { send() {}, addEventListener() {}, removeEventListener() {} },
  createWebSocketJob: vi.fn(),
}));

import { EventDetails } from './EventDetails';

function eventWithLocation(location: string): CalendarEvent {
  return {
    id: 'occurrence-1',
    eventId: 'event-1',
    occurrenceKey: 'occurrence-1',
    isCancelled: false,
    isReadOnly: true,
    attendees: [],
    sourceCalendarIds: [DEFAULT_CALENDAR_SOURCE.id],
    recurrenceLines: [],
    title: 'Planning',
    start: '2026-09-25T10:00:00.000Z',
    end: '2026-09-25T11:00:00.000Z',
    allDay: false,
    calendar: DEFAULT_CALENDAR_SOURCE,
    visibleCalendars: [DEFAULT_CALENDAR_SOURCE],
    location,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('opens a physical calendar location in Maps only after the accessible action is activated', () => {
  const location = '10 Main Street, Montréal';
  const { container } = render(() => (
    <EventDetails event={eventWithLocation(location)} timeFormat="12-hour" />
  ));

  expect(container.textContent).toContain(location);
  fireEvent.click(screen.getByRole('button', { name: 'Open in Maps' }));
  expect(open).toHaveBeenCalledWith(
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`
  );
});

it('keeps an address-and-phone location dialable without searching for the phone number', () => {
  const location = '10 Main Street, 555-123-4567';
  render(() => (
    <EventDetails event={eventWithLocation(location)} timeFormat="12-hour" />
  ));

  const phone = screen.getByRole('link', { name: '555-123-4567' });
  expect(phone.getAttribute('href')).toBe('tel:5551234567');
  fireEvent.click(screen.getByRole('button', { name: 'Open in Maps' }));
  expect(open).toHaveBeenCalledWith(
    'https://www.google.com/maps/search/?api=1&query=10%20Main%20Street'
  );
});

it.each([
  ['Meeting at 10 Main Street', 'Meeting%20at%2010%20Main%20Street'],
  ['Hilton Hotel Conference Center', 'Hilton%20Hotel%20Conference%20Center'],
])(
  'keeps a physical destination available when its name includes meeting words: %s',
  (location, query) => {
    render(() => (
      <EventDetails event={eventWithLocation(location)} timeFormat="12-hour" />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Open in Maps' }));
    expect(open).toHaveBeenCalledWith(
      `https://www.google.com/maps/search/?api=1&query=${query}`
    );
  }
);

it.each([
  '555-123-4567',
  'Join Zoom meeting 123 456 7890, passcode 123456',
  'Zoom Conference Center',
  'https://meet.google.com/abc-defg-hij',
  'Room 123456, access code 998877',
  '2026-09-25',
  'Online only',
  'Project kickoff',
  'ext 1234',
  'Conference only',
  'Dial-in ext 1234',
])('does not offer a misleading map for %s', (location) => {
  render(() => (
    <EventDetails event={eventWithLocation(location)} timeFormat="12-hour" />
  ));

  expect(screen.queryByRole('button', { name: 'Open in Maps' })).toBeNull();
});

it.each([
  [
    'Central Park',
    'https://www.google.com/maps/search/?api=1&query=Central%20Park',
  ],
  [
    'https://www.openstreetmap.org/#map=12/40.7829/-73.9654',
    'https://www.openstreetmap.org/#map=12/40.7829/-73.9654',
  ],
])(
  'offers Maps for a named place or recognized map URL: %s',
  (location, url) => {
    render(() => (
      <EventDetails event={eventWithLocation(location)} timeFormat="12-hour" />
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Open in Maps' }));
    expect(open).toHaveBeenCalledWith(url);
  }
);
