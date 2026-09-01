export const URL_PARAMS = {
  messageId: 'email_message_id',
};

// The exported symbol is a compatibility-facing implementation name; only
// the user-visible signature follows the product display brand.
export const MACRO_EMAIL_SIGNATURE = '-- Sent with Conation';

export const MAX_ATTACHMENTS_BYTES_SIZE = 18_000_000;

// Stable id for the compose "To" input so the create gesture can focus it
// synchronously on iOS (the virtual keyboard only opens within a user gesture).
export const EMAIL_COMPOSE_TO_INPUT_ID = 'email-compose-to-input';
