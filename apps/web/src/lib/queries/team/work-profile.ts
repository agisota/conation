import { TeamRole } from '@service-auth/generated/schemas/teamRole';
import type { TeamWithMembers } from '@service-auth/generated/schemas/teamWithMembers';

const WORK_PROFILE_STORAGE_PREFIX = 'conation:work-profile:';

/** Local extras until auth grows dedicated work-profile fields. */
export type WorkProfileExtras = {
  description: string;
  skills: string;
  hours: string;
  timezone: string;
  status: 'available' | 'busy' | 'away';
  emailVisible: boolean;
  activityVisible: boolean;
};

export const EMPTY_WORK_PROFILE_EXTRAS: WorkProfileExtras = {
  description: '',
  skills: '',
  hours: '',
  timezone: '',
  status: 'available',
  emailVisible: true,
  activityVisible: true,
};

function workProfileStorageKey(userId: string): string {
  return `${WORK_PROFILE_STORAGE_PREFIX}${userId}`;
}

function isWorkProfileStatus(
  value: unknown
): value is WorkProfileExtras['status'] {
  return value === 'available' || value === 'busy' || value === 'away';
}

/** Read extras for this user. Missing or corrupt rows return defaults. */
export function loadWorkProfileExtras(userId: string): WorkProfileExtras {
  if (!userId || typeof localStorage === 'undefined') {
    return { ...EMPTY_WORK_PROFILE_EXTRAS };
  }
  try {
    const raw = localStorage.getItem(workProfileStorageKey(userId));
    if (!raw) return { ...EMPTY_WORK_PROFILE_EXTRAS };
    const parsed = JSON.parse(raw) as Partial<WorkProfileExtras>;
    return {
      description:
        typeof parsed.description === 'string' ? parsed.description : '',
      skills: typeof parsed.skills === 'string' ? parsed.skills : '',
      hours: typeof parsed.hours === 'string' ? parsed.hours : '',
      timezone: typeof parsed.timezone === 'string' ? parsed.timezone : '',
      status: isWorkProfileStatus(parsed.status) ? parsed.status : 'available',
      emailVisible: parsed.emailVisible !== false,
      activityVisible: parsed.activityVisible !== false,
    };
  } catch {
    return { ...EMPTY_WORK_PROFILE_EXTRAS };
  }
}

/** Persist extras for this user. No-op when storage is unavailable. */
export function saveWorkProfileExtras(
  userId: string,
  extras: WorkProfileExtras
): boolean {
  if (!userId || typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(workProfileStorageKey(userId), JSON.stringify(extras));
    return true;
  } catch {
    return false;
  }
}

/** Team name + membership role from the existing auth team payload. */
export function resolveWorkProfileFromTeam(
  userId: string,
  team: TeamWithMembers | null | undefined
): { teamName: string | null; role: TeamRole | null } {
  if (!userId || !team) return { teamName: null, role: null };
  const member = team.members.find((entry) => entry.user_id === userId);
  return {
    teamName: team.team?.name ?? null,
    role: member?.role ?? null,
  };
}
