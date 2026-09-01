import { formatNumber, t } from '@app/lib/i18n';
import Buildings from '@phosphor-icons/core/regular/buildings.svg';
import type { NamedTool } from '@service-cognition/generated/tools/tool';
import { For, Show } from 'solid-js';
import { BaseTool } from './BaseTool';
import { Tool } from './Tool';
import { createToolRenderer } from './ToolRenderer';

type ListCompaniesResponse = NamedTool<'ListCompanies', 'response'>['data'];
type CompanyListItem = ListCompaniesResponse['companies'][number];
type GetCompanyResponse = NamedTool<'GetCompany', 'response'>['data'];

function companySubtitle(company: CompanyListItem) {
  const parts: string[] = [];
  const domain = company.domains[0];
  if (domain) parts.push(domain);
  if (company.stage) parts.push(company.stage.label);
  return parts.join(' · ');
}

function CompanyRow(props: { company: CompanyListItem }) {
  return (
    <Tool.ListItem icon={<Buildings class="size-4" />}>
      <div class="min-w-0 flex-1">
        <div class="truncate text-xs text-ink">
          {props.company.name ?? props.company.domains[0] ?? props.company.id}
        </div>
        <Show when={companySubtitle(props.company)}>
          {(subtitle) => (
            <div class="truncate text-xs text-ink-placeholder">
              {subtitle()}
            </div>
          )}
        </Show>
      </div>
    </Tool.ListItem>
  );
}

function ListCompaniesToolResponse(props: ListCompaniesResponse) {
  return (
    <Tool.List>
      <Show
        when={props.companies.length > 0}
        fallback={
          <Tool.ListItem>{t('ai.tools.crm.noMatchingCompanies')}</Tool.ListItem>
        }
      >
        <For each={props.companies}>
          {(company) => <CompanyRow company={company} />}
        </For>
      </Show>
    </Tool.List>
  );
}

const listCompaniesHandler = createToolRenderer({
  name: 'ListCompanies',
  render: (ctx) => {
    const companies = () => ctx.response?.data.companies ?? [];
    const statusText = () => {
      if (!ctx.response) return undefined;
      return t('ai.tools.crm.companyCount', { count: companies().length });
    };

    return (
      <BaseTool
        icon={Buildings}
        renderContext={ctx.renderContext}
        type="call"
        response={
          ctx.response ? (
            <ListCompaniesToolResponse {...ctx.response.data} />
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
          <span class="min-w-0 truncate">
            {t('ai.tools.crm.listCompanies')}
            <Show when={ctx.tool.data.search}>
              {(search) => (
                <> {t('ai.tools.crm.matching', { search: search() })}</>
              )}
            </Show>
            <Show when={ctx.tool.data.stage}>
              {(stage) => <> {t('ai.tools.crm.inStage', { stage: stage() })}</>}
            </Show>
          </span>
          <Show when={statusText()}>
            {(text) => (
              <span class="shrink-0 whitespace-nowrap text-xs text-ink-extra-muted">
                {text()}
              </span>
            )}
          </Show>
        </div>
      </BaseTool>
    );
  },
});

function GetCompanyToolResponse(props: GetCompanyResponse) {
  const details = () => {
    const rows: { label: string; value: string }[] = [];
    if (props.domains.length > 0) {
      rows.push({
        label: t('ai.tools.crm.fields.domains'),
        value: props.domains.join(', '),
      });
    }
    if (props.stage)
      rows.push({
        label: t('ai.tools.crm.fields.stage'),
        value: props.stage.label,
      });
    if (props.ownerUserId) {
      rows.push({ label: t('common.owner'), value: props.ownerUserId });
    }
    if (props.revenue !== undefined && props.revenue !== null) {
      rows.push({
        label: t('ai.tools.crm.fields.revenue'),
        value: formatNumber(props.revenue, {
          style: 'currency',
          currency: 'USD',
        }),
      });
    }
    rows.push({
      label: t('ai.tools.crm.fields.contacts'),
      value: t('ai.tools.crm.contactCount', { count: props.contacts.length }),
    });
    return rows;
  };

  return (
    <Tool.List>
      <Tool.ListItem icon={<Buildings class="size-4" />}>
        <div class="min-w-0 flex-1">
          <div class="truncate text-xs text-ink">
            {props.name ?? props.domains[0] ?? props.id}
          </div>
          <Show when={props.description}>
            {(description) => (
              <div class="truncate text-xs text-ink-placeholder">
                {description()}
              </div>
            )}
          </Show>
        </div>
      </Tool.ListItem>
      <For each={details()}>
        {(row) => (
          <Tool.ListItem>
            <div class="flex min-w-0 flex-1 gap-2 text-xs">
              <span class="shrink-0 text-ink-placeholder">{row.label}</span>
              <span class="min-w-0 truncate text-ink">{row.value}</span>
            </div>
          </Tool.ListItem>
        )}
      </For>
    </Tool.List>
  );
}

const getCompanyHandler = createToolRenderer({
  name: 'GetCompany',
  render: (ctx) => {
    const statusText = () => {
      if (!ctx.response) return undefined;
      const data = ctx.response.data;
      return data.stage?.label ?? data.domains[0];
    };

    return (
      <BaseTool
        icon={Buildings}
        renderContext={ctx.renderContext}
        type="call"
        response={
          ctx.response ? (
            <GetCompanyToolResponse {...ctx.response.data} />
          ) : undefined
        }
      >
        <div class="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
          <span class="min-w-0 truncate">
            {t('ai.tools.crm.readCompany')}
            <Show when={ctx.response?.data.name}>
              {(name) => <> {name()}</>}
            </Show>
          </span>
          <Show when={statusText()}>
            {(text) => (
              <span class="shrink-0 whitespace-nowrap text-xs text-ink-extra-muted">
                {text()}
              </span>
            )}
          </Show>
        </div>
      </BaseTool>
    );
  },
});

export { getCompanyHandler, listCompaniesHandler };
