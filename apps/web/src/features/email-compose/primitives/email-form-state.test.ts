import { message } from '@app/features/email-message/tests/messages';
import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createEmailFormState } from './email-form-state';

describe('createEmailFormState subject generation', () => {
  const context = {
    viewerEmail: () => 'viewer@example.com',
    inboxes: () => [{ id: 'inbox', email_address: 'viewer@example.com' }],
  } as never;

  it.each([undefined, null, ''] as const)(
    'uses bare generated subjects for missing source %s',
    (subject) => {
      createRoot((dispose) => {
        const source = message('source', { subject });
        const form = createEmailFormState(
          context,
          { type: 'replying_to', messageId: source.db_id },
          {
            getMessageById: () => source,
            getDraftForMessageReply: () => undefined,
          }
        );
        expect(form.subject()).toBe('Re:');
        form.setReplyType('forward');
        expect(form.subject()).toBe('Fwd:');
        dispose();
      });
    }
  );

  it('preserves saved draft subjects and leaves standalone compose blank', () => {
    createRoot((dispose) => {
      const source = message('source', { subject: 'Review' });
      const draft = message('draft', {
        subject: 'Custom saved subject',
        is_draft: true,
      });
      const options = {
        getMessageById: () => source,
        getDraftForMessageReply: () => draft,
      };
      expect(
        createEmailFormState(
          context,
          { type: 'replying_to', messageId: 'source' },
          options
        ).subject()
      ).toBe('Custom saved subject');
      expect(createEmailFormState(context).subject()).toBe('');
      dispose();
    });
  });
});
