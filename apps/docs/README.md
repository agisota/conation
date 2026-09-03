# Документация Conation

В этом каталоге находится сайт документации Conation на Mintlify. Публичный
адрес документации пока не считается подтверждённым: локальный предпросмотр
работает независимо от DNS и TLS.

## Локальная разработка

```bash
cd apps/docs
bun install
bun run generate:tools
bun run dev
```

Для команд Mintlify нужна LTS-версия Node.js. Если CLI отклоняет текущую
версию, переключитесь на Node.js 20 или 22 перед запуском `mint dev` или
`mint broken-links`.

## Как устроена документация

- Редактируемые вручную страницы находятся непосредственно в `apps/docs/`.
- Сгенерированные страницы MCP-инструментов записываются в
  `apps/docs/AI/mcp/tools/`.
- Генератор читает схемы Rust из `crates/ai_tools`.

Не редактируйте сгенерированные MCP-страницы вручную. Исправляйте схему или
`scripts/generate-mcp-tool-pages.ts`, затем запускайте `bun run generate:tools`.

## Настройка monorepo в Mintlify

Настройте проект Mintlify как monorepo и укажите каталог документации:

```text
/apps/docs
```
