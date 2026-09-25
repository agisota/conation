import { DOCS_BASE } from '@app/constants/docs-links';
import { useAddInboxFlow, useEmailLinksStatus } from '@core/email-link';
import EmptyStateEmailGraphic from '@design/empty-state-email.svg';
import EmptyStateInboxTrayGraphic from '@design/empty-state-inbox-tray.svg';
import EmptyStateNoFilterMatchGraphic from '@design/empty-state-no-filter-match.svg';
import EmptyStateNoSearchMatchGraphic from '@design/empty-state-no-search-match.svg';
import { EmptyStatePanel, FilteredHiddenBanner } from '@ui';
import { Match, Switch } from 'solid-js';
import { match } from 'ts-pattern';
import { useEmailView } from '../email-view-context';
import type { EmailTab } from '../types';

const EMAIL_DOCS_URL = `${DOCS_BASE}/product/email`;

function tabCopy(tab: EmailTab): { title: string; description: string } {
  return match(tab)
    .with('important', () => ({
      title: 'Почта пуста',
      description: 'Новые письма будут появляться здесь.',
    }))
    .with('noise', () => ({
      title: 'Других писем нет',
      description:
        'Рассылки и уведомления с низким приоритетом появятся здесь.',
    }))
    .with('sent', () => ({
      title: 'Нет отправленных писем',
      description: 'Отправленные вами письма будут отображаться здесь.',
    }))
    .with('calendar', () => ({
      title: 'Нет писем календаря',
      description: 'Приглашения и обновления событий появятся здесь.',
    }))
    .with('drafts', () => ({
      title: 'Нет черновиков',
      description: 'Начатые, но не отправленные письма появятся здесь.',
    }))
    .with('shared', () => ({
      title: 'Нет общих писем',
      description: 'Здесь появятся переписки, которыми поделились коллеги.',
    }))
    .with('all', () => ({
      title: 'Писем пока нет',
      description: 'Подключите почтовый ящик или измените фильтры.',
    }))
    .exhaustive();
}

export function EmailEmptyState() {
  const { state, setFacets, setInboxIds } = useEmailView();
  const emailActive = useEmailLinksStatus();
  const startAddInbox = useAddInboxFlow();
  const searchText = () => state.search.trim();
  const noInboxesSelected = () => state.inboxIds?.length === 0;
  const hasActiveFilters = () =>
    Object.values(state.facets).some((optionIds) => optionIds.length > 0);

  return (
    <Switch>
      <Match when={!emailActive()}>
        <EmptyStatePanel
          graphic={EmptyStateEmailGraphic}
          title="Подключите почту"
          description="Подключите почтовый ящик, чтобы разбирать письма, быстрее отвечать и работать с агентами прямо из почты."
          primaryAction={{
            label: 'Подключить почту',
            onClick: () => void startAddInbox(),
          }}
          documentationUrl={EMAIL_DOCS_URL}
        />
      </Match>

      <Match when={noInboxesSelected()}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateInboxTrayGraphic}
          title="Не выбран почтовый ящик"
          description="Выберите хотя бы один ящик, чтобы увидеть письма."
          primaryAction={{
            label: 'Показать все ящики',
            onClick: () => setInboxIds(undefined),
          }}
        />
      </Match>

      <Match when={searchText()}>
        {(search) => (
          <EmptyStatePanel
            centered
            graphic={EmptyStateNoSearchMatchGraphic}
            title={`По запросу «${search()}» ничего не найдено`}
            description="Поиск охватывает темы, отправителей и текст писем. Попробуйте изменить запрос."
            documentationUrl={`${DOCS_BASE}/product/search`}
            documentationLabel="Справка по поиску"
          />
        )}
      </Match>

      <Match when={hasActiveFilters()}>
        <EmptyStatePanel
          centered
          graphic={EmptyStateNoFilterMatchGraphic}
          title="Нет писем, подходящих под фильтры"
          description="Измените или сбросьте фильтры, чтобы увидеть больше писем."
        >
          <FilteredHiddenBanner
            hasHiddenItems={false}
            onClearFilters={() => setFacets({})}
          />
        </EmptyStatePanel>
      </Match>

      <Match when={tabCopy(state.tab)}>
        {(copy) => (
          <EmptyStatePanel
            graphic={EmptyStateInboxTrayGraphic}
            title={copy().title}
            description={copy().description}
            documentationUrl={EMAIL_DOCS_URL}
          />
        )}
      </Match>
    </Switch>
  );
}
