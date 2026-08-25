import { EntityActivitySectionConditional } from '@app/features/activity/EntityActivitySection';
import {
  type CorrespondenceParty,
  CorrespondenceSidePanelSection,
  externalParties,
} from '@app/features/correspondence';
import {
  EntityPropertiesSection,
  EntityTagsSection,
} from '@app/features/property/side-panel/properties';
import { t } from '@app/lib/i18n';
import { SidePanel } from '@components/app/side-panel';
import { References } from '@core/component/References';
import { useEmail } from '@core/context/user';
import { useAttachmentReferencesQuery } from '@queries/storage/attachment-references';
import { createMemo, Show, Suspense } from 'solid-js';
import { useEmailContext } from '../EmailContext';

interface EmailSidePanelSectionsProps {
  threadId: string;
  title: string;
}

export function EmailSidePanelSections(props: EmailSidePanelSectionsProps) {
  const emailCtx = useEmailContext();
  const canEdit = () => emailCtx.permissions().isOwner;
  const currentUserEmail = useEmail();

  // Everyone visibly on the chain — senders and To/Cc recipients across every
  // message. Bcc is left out: it is deliberately hidden correspondence and
  // doesn't belong in a "who is on this thread" summary.
  const externalThreadParties = createMemo<CorrespondenceParty[]>(() => {
    const messages = emailCtx.thread()?.messages ?? [];
    const participants: CorrespondenceParty[] = [];
    for (const message of messages) {
      if (message.from?.email) {
        participants.push({
          email: message.from.email,
          name: message.from.name ?? undefined,
        });
      }
      for (const contact of [...message.to, ...message.cc]) {
        participants.push({
          email: contact.email,
          name: contact.name ?? undefined,
        });
      }
    }
    return externalParties(participants, currentUserEmail());
  });

  return (
    <>
      <EntityTagsSection
        entityId={props.threadId}
        entityType="THREAD"
        canEdit={canEdit()}
        order={20}
      />
      <SidePanel.Section
        id="properties"
        title={t('common.properties')}
        defaultOpen
        order={30}
      >
        <Suspense fallback={<SidePanel.Loading />}>
          <EntityPropertiesSection
            entityId={props.threadId}
            entityType="THREAD"
            canEdit={canEdit()}
            documentName={props.title}
            propertyFilter={(property) => property.isMetadata !== true}
            showTags={false}
          />
        </Suspense>
      </SidePanel.Section>
      <CorrespondenceSidePanelSection
        parties={externalThreadParties()}
        order={35}
      />
      <EntityActivitySectionConditional
        entityId={props.threadId}
        entityType="THREAD"
        order={40}
      />
      <ReferencesSectionConditional threadId={props.threadId} />
    </>
  );
}

function ReferencesSectionConditional(props: { threadId: string }) {
  const references = useAttachmentReferencesQuery(
    () => props.threadId,
    () => 'email'
  );

  const count = () => references.data?.length ?? 0;

  return (
    <Show when={count() > 0}>
      <SidePanel.Section
        id="references"
        title={
          <SidePanel.CountTitle
            label={t('blockEmail.sidePanel.references')}
            count={count()}
          />
        }
        order={50}
      >
        <Suspense fallback={<SidePanel.Loading />}>
          <div class="text-xs">
            <References documentId={props.threadId} entityType="email" />
          </div>
        </Suspense>
      </SidePanel.Section>
    </Show>
  );
}
