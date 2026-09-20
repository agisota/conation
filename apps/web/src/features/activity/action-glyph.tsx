import ChatCircle from '@phosphor/chat-circle.svg';
import Eye from '@phosphor/eye.svg';
import PaperPlaneTilt from '@phosphor/paper-plane-tilt.svg';
import PencilSimple from '@phosphor/pencil-simple.svg';
import Phone from '@phosphor/phone.svg';
import Plus from '@phosphor/plus.svg';
import SlidersHorizontal from '@phosphor/sliders-horizontal.svg';
import Trash from '@phosphor/trash.svg';
import UserMinus from '@phosphor/user-minus.svg';
import UserPlus from '@phosphor/user-plus.svg';
import type { ActivityEvent } from '@queries/activity/graphql/entity';
import { Dynamic } from 'solid-js/web';

export const ACTION_GLYPHS = {
  GraphqlActivityCreated: Plus,
  GraphqlActivityEdited: PencilSimple,
  GraphqlActivityOpened: Eye,
  GraphqlActivityDeleted: Trash,
  GraphqlActivityMessaged: ChatCircle,
  GraphqlActivitySent: PaperPlaneTilt,
  GraphqlActivityPropertyChanged: SlidersHorizontal,
  GraphqlActivityParticipantAdded: UserPlus,
  GraphqlActivityParticipantRemoved: UserMinus,
  GraphqlActivityCallStarted: Phone,
  GraphqlActivityUnknownAction: PencilSimple,
} as const;

/** Category color for glyphs and filter chips. */
export const ACTION_TONE_CLASS = {
  GraphqlActivityCreated: 'text-accent',
  GraphqlActivityEdited: 'text-ink',
  GraphqlActivityOpened: 'text-ink-muted',
  GraphqlActivityDeleted: 'text-red',
  GraphqlActivityMessaged: 'text-accent',
  GraphqlActivitySent: 'text-accent',
  GraphqlActivityPropertyChanged: 'text-ink-muted',
  GraphqlActivityParticipantAdded: 'text-accent',
  GraphqlActivityParticipantRemoved: 'text-red',
  GraphqlActivityCallStarted: 'text-accent',
  GraphqlActivityUnknownAction: 'text-ink-muted',
} as const;

/** A small icon for the kind of action, for glyph-led activity rows. */
export function ActionGlyph(props: {
  action: ActivityEvent['action'];
  class?: string;
}) {
  const tone = ACTION_TONE_CLASS[props.action.__typename];
  return (
    <Dynamic
      component={ACTION_GLYPHS[props.action.__typename]}
      class={`${props.class ?? 'size-3'} ${tone}`}
    />
  );
}
