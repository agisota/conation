import type { EmailMessage } from '@app/features/email-message/core/email-message';
import type { ReplyType } from './reply-type';

const NO_SUBJECT = '[No subject]';

/**
 * A thread subject as it should be shown: accumulated "re:" prefixes stripped,
 * and a name for the blank case so callers never have to render an empty string.
 */
export const displaySubject = (subject: string | null | undefined): string => {
  // Strip before testing for blank: a subject of just "Re:" is empty once the
  // prefix is gone, and callers rely on this never returning an empty string.
  const stripped = subject?.replace(/^(\s*re:\s*)+/i, '').trim();
  return stripped || NO_SUBJECT;
};

export const isPlaceholderSubject = (title: string): boolean =>
  title === NO_SUBJECT;

export const getSubjectText = (
  replyingTo: EmailMessage | undefined,
  replyType: ReplyType | undefined
) => {
  if (!replyingTo) return '';
  if (replyType === 'reply-all' || replyType === 'reply') {
    const subject = replyingTo.subject;
    if (subject && /^re:/i.test(subject)) {
      return subject;
    } else {
      return subject ? `Re: ${subject}` : 'Re:';
    }
  } else if (replyType === 'forward') {
    const subject = replyingTo.subject;
    return subject ? `Fwd: ${subject}` : 'Fwd:';
  } else {
    return replyingTo.subject ?? '';
  }
};
