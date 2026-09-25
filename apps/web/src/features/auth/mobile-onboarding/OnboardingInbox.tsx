import { MobileDrawer } from '@components/app/mobile/MobileDrawer';
import { SwipableRowProvider } from '@components/app/mobile/SwipableRow';
import { touchHandler } from '@core/directive/touchHandler';
import {
  type EmailEntity,
  InlineEntity,
  ListEntity,
  ListEntityNoopMetadataProvider,
  ListLayoutProvider,
} from '@entity';
import CheckIcon from '@phosphor/check.svg';
import { cn } from '@ui';
import { createSignal, For, Show } from 'solid-js';

const CURRENT_USER_ID = 'macro|current@example.com';

const mockEmail = (
  id: string,
  minutesAgo: number,
  senderName: string,
  senderEmail: string,
  subject: string,
  snippet: string
): EmailEntity => {
  const ts = new Date(Date.now() - minutesAgo * 60_000);
  return {
    type: 'email',
    id,
    name: subject,
    ownerId: CURRENT_USER_ID,
    isRead: false,
    isDraft: false,
    isImportant: false,
    done: false,
    senderName,
    senderEmail,
    snippet,
    participants: [{ email: senderEmail, name: senderName }],
    createdAt: ts,
    updatedAt: ts,
  };
};

/** A believable inbox for the onboarding preview — a mix of a colleague ask, an
 *  automated notification, a personal note, and a receipt. Purely local mock
 *  data; senders are other people so they render as the row identity. */
const MOCK_EMAILS: EmailEntity[] = [
  mockEmail(
    'onboarding_email_1',
    9,
    'Sarah Kim',
    'sarah.kim@figma.com',
    'Проверь заголовок запуска до трёх?',
    'Оба варианта в начале документа — никак не выберу. Команда маркетинга хочет опубликовать пост сегодня днём. Быстрый ответ поможет им продолжить.'
  ),
  mockEmail(
    'onboarding_email_3',
    3 * 60,
    'Папа',
    'robert.harlow@gmail.com',
    'Билеты на День благодарения',
    'Нашёл неплохую цену: туда 26-го, обратно 30-го. Забронировать два билета? Со вчерашнего дня цена уже выросла на $80, лучше не откладывать.'
  ),
  mockEmail(
    'onboarding_email_4',
    22 * 60,
    'Streep',
    'receipts@streep.com',
    'Чек от Acme, Inc. — $2,400.00',
    'Платёж на $2,400.00 прошёл. Счёт A1B2-0042, карта Visa, последние цифры 4242. Спасибо за покупку.'
  ),
];

type DrawerAction = {
  label: string;
  destructive?: boolean;
  onClick: () => void;
};
type DrawerActionGroup = { label?: string; items: DrawerAction[] };

/**
 * Onboarding inbox step — a hands-on inbox preview. Renders the real soup-view
 * email row (`ListEntity`) with mocked data so the new user can try the two
 * core gestures before entering the app: swipe left to mark done, and
 * long-press to open an action drawer. All state is local; nothing hits the
 * network.
 */
export function OnboardingInbox() {
  const [emails, setEmails] = createSignal<EmailEntity[]>(MOCK_EMAILS);
  const [drawerEmail, setDrawerEmail] = createSignal<EmailEntity | null>(null);
  const [listRef, setListRef] = createSignal<HTMLElement>();

  const markDone = (id: string) =>
    setEmails((prev) => prev.filter((email) => email.id !== id));

  const closeDrawer = () => setDrawerEmail(null);

  // Grouped like the real SoupEntityActionDrawer: each group renders as its own
  // rounded section, with a gap between groups.
  const drawerActionGroups = (): DrawerActionGroup[] => {
    const email = drawerEmail();
    const removeEmail = () => {
      if (email) markDone(email.id);
    };
    return [
      { items: [{ label: 'Отметить как выполненное', onClick: removeEmail }] },
      {
        items: [
          { label: 'Переместить в папку', onClick: () => {} },
          { label: 'Скопировать ссылку', onClick: () => {} },
        ],
      },
      {
        label: 'Отправитель',
        items: [
          { label: 'Добавить в важные', onClick: () => {} },
          { label: 'Заблокировать отправителя', onClick: () => {} },
        ],
      },
      {
        items: [{ label: 'Удалить', destructive: true, onClick: removeEmail }],
      },
    ];
  };

  return (
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Входящие</h1>
      <p class="text-[15px]/relaxed text-ink/60">
        Смахните письмо влево, чтобы отметить его выполненным. Нажмите и
        удерживайте, чтобы открыть другие действия.
      </p>

      <ListEntityNoopMetadataProvider>
        <ListLayoutProvider ref={listRef}>
          <SwipableRowProvider
            container={listRef}
            canSwipeLeft={() => true}
            onSwipeLeft={(entityId) => markDone(entityId)}
          >
            <div ref={setListRef} class="overflow-hidden border-t border-edge">
              <For
                each={emails()}
                fallback={
                  <div class="flex flex-col items-center justify-center gap-1 py-12 text-center">
                    <p class="text-[15px] font-medium text-ink">
                      Входящих нет 🎉
                    </p>
                    <p class="text-[15px] text-ink/60">
                      Вы разобрали все письма.
                    </p>
                  </div>
                }
              >
                {(email) => (
                  <div
                    ref={(el) =>
                      touchHandler(el, () => ({
                        onLongPress: () => setDrawerEmail(email),
                      }))
                    }
                  >
                    <ListEntity
                      entity={email}
                      timestamp={email.updatedAt}
                      hideCheckbox
                      entityRowConfig={{
                        swipeLeftColor: 'bg-success',
                        swipeLeftRevealedComponent: (
                          <CheckIcon class="size-8 text-panel" />
                        ),
                      }}
                    />
                  </div>
                )}
              </For>
            </div>
          </SwipableRowProvider>
        </ListLayoutProvider>
      </ListEntityNoopMetadataProvider>

      {/* Long-press action drawer (markup modeled on SoupEntityActionDrawer). */}
      <MobileDrawer
        side="bottom"
        open={!!drawerEmail()}
        // The long-press opens the drawer while the finger is still down; with
        // Corvu's default "pointerup" strategy the release lands outside the
        // drawer and immediately dismisses it. Close only on a *new* outside
        // pointer-down instead (same as the real SoupEntityActionDrawer).
        closeOnOutsidePointerStrategy="pointerdown"
        onOpenChange={(open) => {
          if (!open) closeDrawer();
        }}
      >
        <MobileDrawer.Portal>
          <MobileDrawer.Overlay />
          <MobileDrawer.Content aria-label="Действия с письмом">
            <MobileDrawer.Handle />

            <Show when={drawerEmail()}>
              {(email) => (
                <div class="px-4 pb-4 shrink-0 text-sm font-medium text-ink-muted">
                  <InlineEntity entity={email()} />
                </div>
              )}
            </Show>

            <MobileDrawer.ScrollBody>
              <For each={drawerActionGroups()}>
                {(group, groupIndex) => (
                  <>
                    <Show when={groupIndex() > 0}>
                      <div class="mt-3" />
                    </Show>
                    <Show when={group.label}>
                      <MobileDrawer.Label>{group.label}</MobileDrawer.Label>
                    </Show>
                    <MobileDrawer.Section class="flex flex-col shrink-0">
                      <For each={group.items}>
                        {(action) => (
                          <button
                            type="button"
                            class={cn(
                              'flex items-center gap-3 px-4 py-3 text-sm text-left not-last:mb-px bg-surface hover:bg-hover hover-transition-bg',
                              action.destructive
                                ? 'text-failure-ink'
                                : 'text-ink'
                            )}
                            onClick={() => {
                              action.onClick();
                              closeDrawer();
                            }}
                          >
                            {action.label}
                          </button>
                        )}
                      </For>
                    </MobileDrawer.Section>
                  </>
                )}
              </For>
            </MobileDrawer.ScrollBody>
          </MobileDrawer.Content>
        </MobileDrawer.Portal>
      </MobileDrawer>
    </div>
  );
}
