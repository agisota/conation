#!/usr/bin/env bash
# Example: wrap hardcoded strings with t() — for conation i18n L3
# Usage: ./tooling/scripts/i18n-wrap-example.sh apps/web/src/features/channel/Message/ChannelMessage.tsx

set -euo pipefail
FILE="${1:-}"
if [ -z "$FILE" ]; then
  echo "Usage: $0 <file.tsx>"
  exit 1
fi

# This is a minimal demo — real codemod uses ast-grep
# Before:
#   <div>This message was deleted.</div>
#   toast.failure("Couldn't finish setup")
# After:
#   <div>{t('chat.message.deleted')}</div>
#   toast.failure(t('setup.finish.error'))

echo "Example codemod steps for $FILE:"
echo "1. rg -n '\"[A-Z][^\"]*\"' $FILE"
echo "2. Map each to key in apps/web/src/lib/i18n/locales/{ru,en}.json"
echo "3. Import { t } from '@core/i18n' (or via useI18n)"
echo "4. Wrap: t('key')"
echo ""
echo "Keys already seeded:"
cat /root/macro/apps/web/src/lib/i18n/locales/ru.json | head -n 20
echo ""
echo "For mass wrap (3500 strings), run:"
echo "  bunx ast-grep --pattern '\"\$A\"' --lang tsx apps/web/src | head"
echo "Or use lingui extract (if added as dep): bunx lingui extract"
