import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import { throwOnErr } from '@core/util/result';
import { authServiceClient } from '@service-auth/client';
import type { InviteToTeamRequest } from '@service-auth/generated/schemas/inviteToTeamRequest';
import type { TeamInvitesResponse } from '@service-auth/generated/schemas/teamInvitesResponse';
import { useMutation, useQuery } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

import { queryClient } from '../client';
import { type MutationCallbacks, withCallbacks } from '../utils';

import { teamKeys } from './keys';

export function useTeamInvitesQuery(teamId: Accessor<string>) {
  return useQuery(() => ({
    queryKey: teamKeys.invites(teamId()).queryKey,
    queryFn: async () =>
      await throwOnErr(() => authServiceClient.getTeamInvites()),
    enabled: !!teamId(),
  }));
}

function invalidateTeamInvites(teamId: string) {
  return queryClient.invalidateQueries({
    queryKey: teamKeys.invites(teamId).queryKey,
  });
}

type InviteToTeamArgs = { teamId: string; request: InviteToTeamRequest };
type InviteToTeamCallbacks = MutationCallbacks<void, Error, InviteToTeamArgs>;

export function useInviteToTeamMutation(callbacks?: InviteToTeamCallbacks) {
  return useMutation(() => ({
    mutationFn: async ({ request }: InviteToTeamArgs) => {
      await throwOnErr(() => authServiceClient.inviteToTeam(request));
    },

    ...withCallbacks<void, Error, InviteToTeamArgs>(
      {
        onSuccess: (_data, { teamId }) => {
          invalidateTeamInvites(teamId);
          toast.success(t('team.feedback.invitationSent'));
        },

        onError: (error) => {
          console.error('Failed to invite to team', error);
          toast.failure(t('team.feedback.invitationSendFailed'));
        },
      },
      callbacks
    ),
  }));
}

type DeleteTeamInviteArgs = { teamId: string; teamInviteId: string };
type DeleteTeamInviteContext = {
  previousInvites: TeamInvitesResponse | undefined;
};
type DeleteTeamInviteCallbacks = MutationCallbacks<
  void,
  Error,
  DeleteTeamInviteArgs,
  DeleteTeamInviteContext
>;

export function useDeleteTeamInviteMutation(
  callbacks?: DeleteTeamInviteCallbacks
) {
  return useMutation(() => ({
    mutationFn: async ({ teamInviteId }: DeleteTeamInviteArgs) => {
      await throwOnErr(() => authServiceClient.deleteTeamInvite(teamInviteId));
    },

    ...withCallbacks<
      void,
      Error,
      DeleteTeamInviteArgs,
      DeleteTeamInviteContext
    >(
      {
        onMutate: async ({ teamId, teamInviteId }) => {
          const queryKey = teamKeys.invites(teamId).queryKey;
          await queryClient.cancelQueries({ queryKey });

          const previousInvites =
            queryClient.getQueryData<TeamInvitesResponse>(queryKey);

          queryClient.setQueryData<TeamInvitesResponse>(queryKey, (old) =>
            old
              ? {
                  invites: old.invites.filter(
                    (invite) => invite.id !== teamInviteId
                  ),
                }
              : undefined
          );

          return { previousInvites };
        },

        onSuccess: (_data, { teamId }) => {
          invalidateTeamInvites(teamId);
          toast.success(t('team.feedback.invitationCancelled'));
        },

        onError: (error, { teamId }, context) => {
          console.error('Failed to delete team invite', error);
          toast.failure(t('team.feedback.invitationCancelFailed'));

          if (context?.previousInvites) {
            queryClient.setQueryData(
              teamKeys.invites(teamId).queryKey,
              context.previousInvites
            );
          }
        },
      },
      callbacks
    ),
  }));
}
