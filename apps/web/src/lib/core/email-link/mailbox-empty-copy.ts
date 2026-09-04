import { UserProvider } from '@service-email/generated/schemas/userProvider';

/** True when any linked inbox is a Conation (Stalwart) mailbox. */
export function hasStalwartMailbox(
  links: ReadonlyArray<{ provider?: string }> | null | undefined
): boolean {
  return (links ?? []).some((link) => link.provider === UserProvider.STALWART);
}
