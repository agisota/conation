import {
  applyBrandSnapshot,
  currentInstallationBrand,
  refreshInstallationBrand,
} from '@core/brand/BrandProvider';
import { SERVER_HOSTS } from '@core/constant/servers';
import { fetchWithToken } from '@core/util/fetchWithToken';
import { createSignal, Show } from 'solid-js';

type PublishResponse = {
  version: number;
  name: string;
  color: string;
  logoUrl: string | null;
};

export function BrandSettings() {
  const [name, setName] = createSignal(currentInstallationBrand().name);
  const [color, setColor] = createSignal(currentInstallationBrand().color);
  const [baseVersion, setBaseVersion] = createSignal(
    currentInstallationBrand().version
  );
  const [svg, setSvg] = createSignal<string>();
  const [removeLogo, setRemoveLogo] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [message, setMessage] = createSignal('');

  const resetFormFromCurrentBrand = () => {
    const brand = currentInstallationBrand();
    setName(brand.name);
    setColor(brand.color);
    setBaseVersion(brand.version);
    setSvg(undefined);
    setRemoveLogo(false);
  };
  const explainError = (code: string) => {
    if (code === 'CONFLICT')
      return 'Бренд уже изменён другим администратором. Обновите страницу настроек и повторите действие.';
    if (code === 'FORBIDDEN')
      return 'Изменять бренд установки может только администратор установки.';
    return 'Не удалось сохранить бренд. Проверьте данные и попробуйте снова.';
  };

  const publish = async (event: SubmitEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const body: Record<string, unknown> = {
      expectedVersion: baseVersion(),
      name: name().trim(),
      color: color(),
    };
    if (removeLogo()) body.logoSvg = '';
    else if (svg()) body.logoSvg = svg();
    const result = await fetchWithToken<PublishResponse>(
      `${SERVER_HOSTS['auth-service']}/brand`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (result.isErr()) {
      const code = result.error[0]?.code ?? 'HTTP_ERROR';
      if (code === 'CONFLICT') {
        await refreshInstallationBrand().catch(() => undefined);
        resetFormFromCurrentBrand();
      }
      setMessage(explainError(code));
    } else {
      applyBrandSnapshot(result.value);
      await refreshInstallationBrand().catch(() => undefined);
      resetFormFromCurrentBrand();
      setMessage(`Бренд опубликован. Версия ${result.value.version}.`);
    }
    setBusy(false);
  };

  const rollback = async () => {
    if (baseVersion() < 2) return;
    setBusy(true);
    setMessage('');
    const result = await fetchWithToken<PublishResponse>(
      `${SERVER_HOSTS['auth-service']}/brand/rollback`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedVersion: baseVersion(),
          revisionVersion: baseVersion() - 1,
        }),
      }
    );
    if (result.isErr()) {
      const code = result.error[0]?.code ?? 'HTTP_ERROR';
      if (code === 'CONFLICT') {
        await refreshInstallationBrand().catch(() => undefined);
        resetFormFromCurrentBrand();
      }
      setMessage(explainError(code));
    } else {
      applyBrandSnapshot(result.value);
      await refreshInstallationBrand().catch(() => undefined);
      resetFormFromCurrentBrand();
      setMessage(
        `Возвращена предыдущая версия. Новая версия ${result.value.version}.`
      );
    }
    setBusy(false);
  };

  return (
    <section
      class="flex max-w-2xl flex-col gap-6 p-6"
      aria-labelledby="brand-settings-title"
    >
      <header class="flex flex-col gap-1">
        <h2 id="brand-settings-title" class="text-xl font-semibold text-ink">
          Бренд установки
        </h2>
        <p class="text-sm text-ink-muted">
          Изменения сразу видны на экране входа и в уже открытых приложениях.
        </p>
      </header>
      <form class="flex flex-col gap-4" onSubmit={publish}>
        <label class="flex flex-col gap-1 text-sm font-medium text-ink">
          Название
          <input
            class="rounded-lg border border-edge bg-surface px-3 py-2 text-ink"
            maxlength="80"
            required
            value={name()}
            onInput={(event) => setName(event.currentTarget.value)}
          />
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium text-ink">
          Основной цвет
          <input
            aria-label="Основной цвет бренда"
            class="h-11 w-20 rounded border border-edge bg-surface"
            type="color"
            value={color()}
            onInput={(event) => setColor(event.currentTarget.value)}
          />
        </label>
        <label class="flex flex-col gap-1 text-sm font-medium text-ink">
          Логотип в формате SVG
          <input
            class="text-sm text-ink"
            type="file"
            accept="image/svg+xml,.svg"
            onChange={async (event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) {
                setSvg(undefined);
                return;
              }
              if (file.size > 65_536) {
                setSvg(undefined);
                setRemoveLogo(false);
                setMessage('Размер SVG не должен превышать 64 КБ.');
                event.currentTarget.value = '';
                return;
              }
              setSvg(await file.text());
              setRemoveLogo(false);
              setMessage('');
            }}
          />
        </label>
        <p class="text-xs text-ink-muted">
          Поддерживаются статические SVG-фигуры (path, circle, rect, line,
          polygon, ellipse и group). Скрипты, стили, встроенные документы и
          внешние ссылки запрещены.
        </p>
        <label class="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={removeLogo()}
            onChange={(event) => {
              setRemoveLogo(event.currentTarget.checked);
              if (event.currentTarget.checked) setSvg(undefined);
            }}
          />
          Удалить текущий логотип
        </label>
        <div class="flex flex-wrap gap-3">
          <button
            class="rounded-lg bg-accent px-4 py-2 text-white disabled:opacity-50"
            type="submit"
            disabled={busy()}
          >
            Опубликовать
          </button>
          <button
            class="rounded-lg border border-edge px-4 py-2 text-ink disabled:opacity-50"
            type="button"
            disabled={busy() || baseVersion() < 2}
            onClick={rollback}
          >
            Вернуть предыдущую версию
          </button>
        </div>
      </form>
      <Show when={currentInstallationBrand().logoUrl}>
        <img
          class="size-12 object-contain"
          src={currentInstallationBrand().logoUrl ?? ''}
          alt="Текущий логотип"
        />
      </Show>
      <p class="text-xs text-ink-muted">
        Текущая версия: {currentInstallationBrand().version}
      </p>
      <Show when={message()}>
        <p class="text-sm text-ink-muted" role="status" aria-live="polite">
          {message()}
        </p>
      </Show>
    </section>
  );
}
