import { t } from '@app/lib/i18n';
import type { AccessLevel } from '@service-storage/generated/schemas/accessLevel';
import type { LinkShare } from '@service-storage/generated/schemas/linkShare';
import type { UpdateSharePermissionRequestV2 } from '@service-storage/generated/schemas/updateSharePermissionRequestV2';

export const NO_LINK_SHARE = 'NONE' as const;

export type LinkShareScope = LinkShare | typeof NO_LINK_SHARE;

export type LinkSharePayload = Required<
  Pick<UpdateSharePermissionRequestV2, 'linkShare' | 'linkShareAccessLevel'>
>;

type LinkShareScopeCopy = {
  label: string;
  title: string;
  description: string;
};

export type ShareStatus = {
  kind: 'public' | 'team' | 'shared' | 'private';
  label: string;
  tooltip: string;
};

/** Stable scope values with English labels retained for compatibility callers. */
export const LINK_SHARE_SCOPE_OPTIONS = (
  ['NONE', 'PUBLIC', 'TEAM'] as const
).map((scope) => ({
  value: scope,
  label: scope === 'NONE' ? 'None' : scope === 'PUBLIC' ? 'Public' : 'Team',
}));

export function getLinkShareScope(
  linkShare: LinkShare | null | undefined
): LinkShareScope {
  return linkShare ?? NO_LINK_SHARE;
}

export function buildLinkSharePayload(
  scope: LinkShareScope,
  accessLevel?: AccessLevel | null
): LinkSharePayload {
  if (scope === NO_LINK_SHARE) {
    return {
      linkShare: null,
      linkShareAccessLevel: null,
    };
  }

  return {
    linkShare: scope,
    linkShareAccessLevel: accessLevel ?? 'view',
  };
}

export function buildLinkShareScopePayload(
  currentScope: LinkShareScope,
  nextScope: LinkShareScope,
  currentAccessLevel?: AccessLevel | null
): LinkSharePayload {
  const accessLevel =
    currentScope === NO_LINK_SHARE ? null : currentAccessLevel;
  return buildLinkSharePayload(nextScope, accessLevel);
}

export function getLinkShareScopeCopy(
  scope: LinkShareScope
): LinkShareScopeCopy {
  const key = scope.toLowerCase();
  return {
    label: t(`core.sharing.link.${key}.label`),
    title: t(`core.sharing.link.${key}.title`),
    description: t(`core.sharing.link.${key}.description`),
  };
}

export function getShareStatus(
  linkShare: LinkShare | null | undefined,
  hasExplicitShares: boolean
): ShareStatus {
  if (linkShare === 'PUBLIC') {
    return {
      kind: 'public',
      label: t('core.sharing.link.public.label'),
      tooltip: getLinkShareScopeCopy('PUBLIC').description,
    };
  }

  if (linkShare === 'TEAM') {
    return {
      kind: 'team',
      label: t('core.sharing.link.team.label'),
      tooltip: getLinkShareScopeCopy('TEAM').description,
    };
  }

  if (hasExplicitShares) {
    return {
      kind: 'shared',
      label: t('core.sharing.status.shared.label'),
      tooltip: t('core.sharing.status.shared.tooltip'),
    };
  }

  return {
    kind: 'private',
    label: t('core.sharing.status.private.label'),
    tooltip: t('core.sharing.status.private.tooltip'),
  };
}
