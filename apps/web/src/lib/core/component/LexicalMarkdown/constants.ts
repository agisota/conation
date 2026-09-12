import { t } from '@app/lib/i18n';
import { isNativeMobilePlatform } from '@core/mobile/isNativeMobilePlatform';

let layer = 0;

export const MarkdownStackingContext = {
  Base: layer++,
  Highlights: layer++,
  Decorators: layer++,
  Accessories: layer++,
} as const;

export enum MarkdownEditorErrors {
  EMPTY_SOURCE = 'EMPTY_SOURCE',
  JSON_PARSE_ERROR = 'JSON_PARSE_ERROR',
  VERSION_MISMATCH_ERROR = 'VERSION_MISMATCH_ERROR',
  STAGING_VERSION_MISMATCH_ERROR = 'STAGING_VERSION_MISMATCH_ERROR',
}

const MarkdownEditorErrorDescriptions: Record<
  MarkdownEditorErrors,
  () => string
> = {
  [MarkdownEditorErrors.EMPTY_SOURCE]: () => t('editor.error.emptySource'),
  [MarkdownEditorErrors.JSON_PARSE_ERROR]: () => t('editor.error.invalidJson'),
  // The native mobile app has no way to refresh a page, so tell those users to
  // relaunch the app instead.
  [MarkdownEditorErrors.VERSION_MISMATCH_ERROR]: () =>
    isNativeMobilePlatform()
      ? t('editor.error.versionMismatch.mobile')
      : t('editor.error.versionMismatch.web'),
  [MarkdownEditorErrors.STAGING_VERSION_MISMATCH_ERROR]: () =>
    t('editor.error.stagingVersionMismatch'),
};

export const getErrorDescription = (
  errorType: MarkdownEditorErrors
): string => {
  return (
    MarkdownEditorErrorDescriptions[errorType]?.() ??
    t('editor.error.unknown')
  );
};
