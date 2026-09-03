import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { t } from '@app/lib/i18n';
import { toast } from '@core/component/Toast/Toast';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';
import {
  EMAIL_DIGEST_NOTIFICATION_TYPE,
  mutedEntityTypeLabel,
  NOTIFICATION_EVENT_GROUPS,
} from '@notifications/notification-event-catalog';
import { useNotificationSettings } from '@notifications/notification-settings';
import { queryReadyGate } from '@queries/gate';
import {
  useNotificationTypePreferencesQuery,
  useSetNotificationTypeEnabledMutation,
} from '@queries/notification/type-preferences';
import {
  useMutedEntitiesQuery,
  useUnmuteItemMutation,
} from '@queries/notification/unsubscribes';
import { ToggleSwitch } from '@ui';
import { For, Show } from 'solid-js';
import {
  SettingsCard,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from './primitives';
import {
  mutedEntityLabel,
  notificationEventDescription,
  notificationEventLabel,
  notificationGroupLabel,
} from './settings-i18n';

export function Notifications() {
  const analytics = useAnalytics();
  const platformSettings = useNotificationSettings();
  const preferencesQuery = useNotificationTypePreferencesQuery();
  const setTypeEnabled = useSetNotificationTypeEnabledMutation();
  const mutedEntitiesQuery = useMutedEntitiesQuery({ limit: 100 });
  const unmuteItem = useUnmuteItemMutation();
  const prefsReady = () =>
    !preferencesQuery.isError && queryReadyGate(preferencesQuery);
  const mutedEntities = () =>
    !mutedEntitiesQuery.isError && queryReadyGate(mutedEntitiesQuery)
      ? mutedEntitiesQuery.data
      : [];

  const disabledTypes = () =>
    new Set(
      !preferencesQuery.isError && queryReadyGate(preferencesQuery)
        ? preferencesQuery.data.disabled_types
        : []
    );

  const isTypeEnabled = (type: string) => !disabledTypes().has(type);

  const toggleType = async (type: string, enabled: boolean) => {
    try {
      await setTypeEnabled.mutateAsync({ type, enabled });
    } catch {
      toast.failure(t('settings.notifications.errors.updatePreference'));
    }
  };

  const unmuteEntity = async (item: { item_id: string; item_type: string }) => {
    try {
      await unmuteItem.mutateAsync(item);
    } catch {
      toast.failure(t('settings.notifications.errors.unmute'));
    }
  };

  const pushLabel = () =>
    isNativeMobilePlatform()
      ? t('settings.notifications.delivery.push.mobile.label')
      : t('settings.notifications.delivery.push.desktop.label');
  const pushDescription = () =>
    isNativeMobilePlatform()
      ? t('settings.notifications.delivery.push.mobile.description')
      : t('settings.notifications.delivery.push.desktop.description');

  return (
    <SettingsPage
      title={t('settings.notifications.title')}
      description={t('settings.notifications.description')}
    >
      <SettingsSection title={t('settings.notifications.delivery.title')}>
        <SettingsCard>
          <SettingsRow
            label={t('settings.notifications.delivery.inbox.label')}
            description={t('settings.notifications.delivery.inbox.description')}
          >
            <span class="text-sm text-ink-muted">
              {t('settings.notifications.delivery.alwaysOn')}
            </span>
          </SettingsRow>
          <Show
            when={platformSettings.isSupported && platformSettings}
            fallback={
              <SettingsRow label={pushLabel()} description={pushDescription()}>
                <span class="text-sm text-ink-muted">
                  {t('settings.notifications.delivery.notSupported')}
                </span>
              </SettingsRow>
            }
          >
            {(settings) => (
              <SettingsRow label={pushLabel()} description={pushDescription()}>
                <ToggleSwitch
                  size="md"
                  checked={settings().isEnabled()}
                  onChange={(enabled) => {
                    analytics.track('notifications_toggled');
                    void settings().toggle(enabled);
                  }}
                />
              </SettingsRow>
            )}
          </Show>
          <SettingsRow
            label={t('settings.notifications.delivery.emailDigest.label')}
            description={t(
              'settings.notifications.delivery.emailDigest.description'
            )}
          >
            <ToggleSwitch
              size="md"
              checked={isTypeEnabled(EMAIL_DIGEST_NOTIFICATION_TYPE)}
              disabled={!prefsReady()}
              onChange={(enabled) =>
                toggleType(EMAIL_DIGEST_NOTIFICATION_TYPE, enabled)
              }
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <For each={NOTIFICATION_EVENT_GROUPS}>
        {(group) => (
          <SettingsSection
            title={notificationGroupLabel(group.id, group.label)}
          >
            <SettingsCard>
              <For each={group.events}>
                {(event) => (
                  <SettingsRow
                    label={notificationEventLabel(event.type, event.label)}
                    description={notificationEventDescription(
                      event.type,
                      event.description
                    )}
                  >
                    <ToggleSwitch
                      size="md"
                      checked={isTypeEnabled(event.type)}
                      disabled={!prefsReady()}
                      onChange={(enabled) => toggleType(event.type, enabled)}
                    />
                  </SettingsRow>
                )}
              </For>
            </SettingsCard>
          </SettingsSection>
        )}
      </For>

      <SettingsSection
        title={t('settings.notifications.muted.title')}
        description={t('settings.notifications.muted.description')}
      >
        <SettingsCard>
          <Show
            when={mutedEntities().length > 0}
            fallback={
              <SettingsRow
                label={t('settings.notifications.muted.empty.label')}
                description={t(
                  'settings.notifications.muted.empty.description'
                )}
              />
            }
          >
            <For each={mutedEntities()}>
              {(item) => (
                <SettingsRow
                  label={mutedEntityLabel(
                    item.item_type,
                    mutedEntityTypeLabel(item.item_type)
                  )}
                  description={item.item_id}
                >
                  <button
                    type="button"
                    class="text-sm text-ink-muted hover:text-ink"
                    onClick={() => unmuteEntity(item)}
                  >
                    {t('settings.notifications.muted.unmute')}
                  </button>
                </SettingsRow>
              )}
            </For>
          </Show>
        </SettingsCard>
      </SettingsSection>
    </SettingsPage>
  );
}
