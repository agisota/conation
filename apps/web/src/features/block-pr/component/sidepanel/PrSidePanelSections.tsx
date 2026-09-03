import { t } from '@app/lib/i18n';
import {
  GithubPullRequestChecksContent,
  GithubPullRequestDetailsContent,
  SidePanel,
} from '@components/app/side-panel';
import type { GithubPullRequestWithDetails } from '@queries/storage/github-pull-requests';
import type { Accessor } from 'solid-js';

export function PrSidePanelSections(props: {
  enrichment: Accessor<GithubPullRequestWithDetails | undefined>;
}) {
  return (
    <>
      <SidePanel.Section
        id="pr-details"
        title={t('common.details')}
        defaultOpen
        order={10}
      >
        <GithubPullRequestDetailsContent enrichment={props.enrichment} />
      </SidePanel.Section>

      <SidePanel.Section
        id="pr-checks"
        title={t('pullRequest.checks.title')}
        order={20}
      >
        <GithubPullRequestChecksContent enrichment={props.enrichment} />
      </SidePanel.Section>
    </>
  );
}
