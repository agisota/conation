import { t } from '@app/lib/i18n';
import { registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';

interface EmailHotkeyHandlers {
  replyToFocusedMessage: () => boolean;
  replyAllToFocusedMessage?: () => boolean;
  forwardFocusedMessage: () => boolean;
  blockSender: () => boolean;
  markDone: () => boolean;
  markNotDone: () => boolean;
  /** Gates which of Mark done / Mark as not done is active. */
  isThreadDone: () => boolean;
  /** Whether the done state can be reversed at all — false for threads that
   *  are structurally done (no inbound message), where Mark as not done is a
   *  no-op. */
  canMarkNotDone: () => boolean;
  markUnread: () => boolean;
  markRead: () => boolean;
  /** Gates which of Mark as unread / Mark as read is active. */
  isThreadMarkedUnread: () => boolean;
  markSenderSignal: () => boolean;
  markSenderNoise: () => boolean;
  navigateToPreviousMessage: () => boolean;
  navigateToNextMessage: () => boolean;
}

export function registerEmailHotkeys(
  scopeId: string,
  handlers: EmailHotkeyHandlers
) {
  if (handlers.replyAllToFocusedMessage) {
    registerHotkey({
      hotkey: 'opt+r',
      scopeId: scopeId,
      description: () => t('blockEmail.hotkeys.replyAllToMessage'),
      keyDownHandler: handlers.replyAllToFocusedMessage,
      hotkeyToken: TOKENS.email.replyAll,
      displayPriority: 8,
    });
  }

  registerHotkey({
    hotkey: 'r',
    scopeId: scopeId,
    description: () => t('blockEmail.hotkeys.replyToMessage'),
    keyDownHandler: handlers.replyToFocusedMessage,
    hotkeyToken: TOKENS.email.reply,
    displayPriority: 9,
  });

  registerHotkey({
    hotkey: 'f',
    scopeId: scopeId,
    description: () => t('blockEmail.hotkeys.forwardMessage'),
    keyDownHandler: handlers.forwardFocusedMessage,
    hotkeyToken: TOKENS.email.forward,
    displayPriority: 7,
  });
  registerHotkey({
    hotkey: 'e',
    scopeId,
    description: () => t('blockEmail.actions.markDone'),
    keyDownHandler: handlers.markDone,
    hotkeyToken: TOKENS.entity.action.markDone,
    displayPriority: 10,
    condition: () => !handlers.isThreadDone(),
  });
  registerHotkey({
    hotkey: 'shift+e',
    scopeId,
    description: () => t('blockEmail.actions.markNotDone'),
    keyDownHandler: handlers.markNotDone,
    hotkeyToken: TOKENS.entity.action.markNotDone,
    displayPriority: 10,
    condition: () => handlers.isThreadDone() && handlers.canMarkNotDone(),
  });
  registerHotkey({
    hotkey: 'u',
    scopeId,
    description: () => t('blockEmail.actions.markUnread'),
    keyDownHandler: handlers.markUnread,
    hotkeyToken: TOKENS.entity.action.markUnread,
    displayPriority: 9,
    condition: () => !handlers.isThreadMarkedUnread(),
  });
  registerHotkey({
    hotkey: 'shift+u',
    scopeId,
    description: () => t('blockEmail.actions.markRead'),
    keyDownHandler: handlers.markRead,
    hotkeyToken: TOKENS.entity.action.markRead,
    displayPriority: 9,
    condition: () => handlers.isThreadMarkedUnread(),
  });
  registerHotkey({
    scopeId: scopeId,
    description: () => t('blockEmail.actions.blockSender'),
    keyDownHandler: handlers.blockSender,
    hotkeyToken: TOKENS.email.blockSender,
    displayPriority: 5,
  });
  registerHotkey({
    scopeId: scopeId,
    description: () => t('blockEmail.actions.senderToSignal'),
    keyDownHandler: handlers.markSenderSignal,
    hotkeyToken: TOKENS.email.markSenderSignal,
    displayPriority: 5,
  });
  registerHotkey({
    scopeId: scopeId,
    description: () => t('blockEmail.actions.senderToNoise'),
    keyDownHandler: handlers.markSenderNoise,
    hotkeyToken: TOKENS.email.markSenderNoise,
    displayPriority: 5,
  });
  registerHotkey({
    hotkey: 'arrowup',
    scopeId,
    description: () => t('blockEmail.hotkeys.previousMessage'),
    keyDownHandler: handlers.navigateToPreviousMessage,
    hotkeyToken: TOKENS.email.previousMessage,
  });
  registerHotkey({
    hotkey: 'arrowdown',
    scopeId,
    description: () => t('blockEmail.hotkeys.nextMessage'),
    keyDownHandler: handlers.navigateToNextMessage,
    hotkeyToken: TOKENS.email.nextMessage,
  });
}
