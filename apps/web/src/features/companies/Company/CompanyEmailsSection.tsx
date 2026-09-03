import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import { t } from '@app/lib/i18n';
import { TabsInset } from '@core/component/TabsInset';
import {
  type CrmCompanyEntity,
  ListEntity,
  ListEntityMetadataQueryProvider,
  ListLayoutProvider,
} from '@entity';
import { createMemo, createSignal, For, Show } from 'solid-js';
import {
  type EmailSignalView,
  type EmailView,
  useCompanyEmailsQuery,
} from './use-company-emails-query';
import { useInfiniteScrollSentinel } from './use-infinite-scroll-sentinel';

export function CompanyEmailsSection(props: { company?: CrmCompanyEntity }) {
  const domains = createMemo(
    () => props.company?.domains.map((domain) => domain.domain) ?? []
  );
  const [view, setView] = createSignal<EmailView>('team');
  const [signalView, setSignalView] = createSignal<EmailSignalView>('all');
  const emailsQuery = useCompanyEmailsQuery(domains, view, signalView);
  const emails = () => emailsQuery.data?.entities ?? [];

  const [listRef, setListRef] = createSignal<HTMLElement>();
  const [sentinelRef, setSentinelRef] = createSignal<HTMLDivElement>();

  useInfiniteScrollSentinel({
    sentinel: sentinelRef,
    hasNextPage: () => emailsQuery.hasNextPage ?? false,
    isFetchingNextPage: () => emailsQuery.isFetchingNextPage,
    fetchNextPage: () => emailsQuery.fetchNextPage(),
  });

  const emptyMessage = () => {
    const kind = signalView() === 'signal' ? 'signal' : 'all';
    if (view() === 'me') return t('companies.emails.empty.inbox', { kind });
    if (props.company?.emailSync === false) {
      return t('companies.emails.empty.syncDisabled');
    }
    return t('companies.emails.empty.team', { kind });
  };

  return (
    <div class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-sm font-medium text-ink-muted">
          {t('companies.sections.emails')}
        </h2>
        <div class="flex items-center gap-2.5">
          <TabsInset
            list={[
              { value: 'signal', label: t('companies.emails.tabs.signal') },
              { value: 'all', label: t('companies.emails.tabs.all') },
            ]}
            value={signalView()}
            onChange={(v) => setSignalView(v as EmailSignalView)}
          />
          <TabsInset
            list={[
              { value: 'team', label: t('companies.emails.tabs.team') },
              { value: 'me', label: t('companies.emails.tabs.me') },
            ]}
            value={view()}
            onChange={(v) => setView(v as EmailView)}
          />
        </div>
      </div>
      <Show
        when={props.company && !emailsQuery.isLoading}
        fallback={
          <div class="p-6 text-center text-sm text-ink-muted">
            {t('common.loading')}
          </div>
        }
      >
        <Show
          when={emails().length > 0}
          fallback={
            <div class="rounded-lg border border-dashed border-edge-muted p-6 text-center text-sm text-ink-muted">
              {emptyMessage()}
            </div>
          }
        >
          <div class="max-h-96 overflow-y-auto">
            <ListEntityMetadataQueryProvider>
              <ListLayoutProvider ref={listRef}>
                <div ref={setListRef} class="flex flex-col">
                  <For each={emails()}>
                    {(entity) => (
                      <ListEntity
                        entity={entity}
                        timestamp={entity.updatedAt}
                        onClick={() =>
                          openEntityInSplitFromUnifiedList(entity, {})
                        }
                      />
                    )}
                  </For>
                </div>
              </ListLayoutProvider>
            </ListEntityMetadataQueryProvider>
            <Show when={emailsQuery.hasNextPage}>
              <div ref={setSentinelRef} class="h-px" />
            </Show>
            <Show when={emailsQuery.isFetchingNextPage}>
              <div class="p-3 text-center text-xs text-ink-muted">
                {t('companies.emails.loadingMore')}
              </div>
            </Show>
          </div>
        </Show>
      </Show>
    </div>
  );
}
