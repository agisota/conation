import { useSoupFilterPersistence } from '@app/features/next-soup/use-soup-filter-persistence';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  clearAllDebugSettings,
  DEBUG_SETTING_KEYS,
  DEBUG_SETTINGS,
  type DebugSettingDef,
  debugSettings,
  getDebugSetting,
  setDebugSetting,
} from '@app/lib/debugSettings';
import { t } from '@app/lib/i18n';
import {
  ENABLE_SOUP_FILTER_PERSISTENCE_FLAG,
  ENABLE_SOUP_FILTER_PERSISTENCE_OVERRIDE,
} from '@core/constant/featureFlags';
import { Button, ToggleSwitch } from '@ui';
import { For, Show } from 'solid-js';
import { SettingsCard, SettingsPage, SettingsRow } from './primitives';

const DEBUG_SETTING_I18N: Record<
  DebugSettingDef['key'],
  { label: string; description: string }
> = {
  [DEBUG_SETTING_KEYS.FORCE_EMPTY_STATES]: {
    label: 'settings.admin.forceEmptyStates.label',
    description: 'settings.admin.forceEmptyStates.description',
  },
};

function DebugSettingRow(props: { setting: DebugSettingDef }) {
  const checked = () => getDebugSetting(props.setting.key);
  const i18n = DEBUG_SETTING_I18N[props.setting.key];

  return (
    <SettingsRow
      label={t(i18n.label)}
      description={t(i18n.description)}
    >
      <ToggleSwitch
        size="md"
        checked={checked()}
        onChange={(value) => setDebugSetting(props.setting.key, value)}
      />
    </SettingsRow>
  );
}

export function Admin() {
  const hasActiveSettings = () => Object.keys(debugSettings()).length > 0;
  const soupFilterPersistenceFlag = useFeatureFlag(
    ENABLE_SOUP_FILTER_PERSISTENCE_FLAG,
    { enabledOverride: ENABLE_SOUP_FILTER_PERSISTENCE_OVERRIDE }
  );
  const [shouldPersistSoupFilters, setShouldPersistSoupFilters] =
    useSoupFilterPersistence();

  return (
    <SettingsPage
      title={t('settings.admin.title')}
      description={t('settings.admin.description')}
      actions={
        <Button
          variant="outline"
          size="sm"
          depth={3}
          disabled={!hasActiveSettings()}
          onClick={clearAllDebugSettings}
        >
          {t('settings.admin.resetAll')}
        </Button>
      }
    >
      <Show when={soupFilterPersistenceFlag().enabled}>
        <SettingsCard>
          <SettingsRow
            label={t('settings.admin.persistFilters.label')}
            description={t('settings.admin.persistFilters.description')}
          >
            <ToggleSwitch
              size="md"
              checked={shouldPersistSoupFilters()}
              onChange={setShouldPersistSoupFilters}
            />
          </SettingsRow>
        </SettingsCard>
      </Show>

      <SettingsCard>
        <For each={DEBUG_SETTINGS}>
          {(setting) => <DebugSettingRow setting={setting} />}
        </For>
      </SettingsCard>
    </SettingsPage>
  );
}
