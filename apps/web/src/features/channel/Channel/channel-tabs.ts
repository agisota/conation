export const CHANNEL_TABS = [
  { value: 'messages', labelKey: 'channel.tabs.messages' },
  { value: 'attachments', labelKey: 'channel.tabs.attachments' },
  { value: 'participants', labelKey: 'channel.tabs.participants' },
  { value: 'call', labelKey: 'channel.tabs.call' },
] as const;

export type ChannelTabId = (typeof CHANNEL_TABS)[number]['value'];

export const DEFAULT_CHANNEL_TAB: ChannelTabId = 'messages';
