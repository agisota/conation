# Локальный компонент FusionAuth

Единственный поддерживаемый способ поднять локальный Conation-стек — из
корня репозитория:

```bash
just stack up
```

Эта команда запускает `xtask` (`cargo x stack up`). Он одновременно
генерирует изолированные для инстанса Compose-override, окружение сервисов и
FusionAuth kickstart в `infra/local/generated/<instance>/kickstart/`. Поэтому
сервисы и FusionAuth всегда используют одну Conation identity-конфигурацию, а
старый ручной путь не может прочитать application secret и записать его в
корневой `.env`.

`docker-compose.yml` в этой директории — только низкоуровневая база, которую
`xtask` дополняет сгенерированным override. Не запускайте его напрямую:
базовый файл намеренно не содержит kickstart, API-ключей, JWT-ключей, клиента
OAuth или учётной записи администратора. Без override он не является
настроенным продуктовым контуром.

Устаревшие recipes именно из этого nested justfile (например,
`just --justfile infra/stacks/fusionauth-instance/justfile setup`, `start`,
`import_dev` и `insert_local_fusionauth_variables`) специально завершаются с
ошибкой и указывают на `just stack up`. Это не относится к `just setup` в
корне репозитория: root recipe использует новый stack flow.

## Границы Pulumi

Файлы `Pulumi.dev.yaml`, `Pulumi.prod.yaml` и TypeScript-источник рядом с ними
относятся к прежней удалённой инфраструктуре Macro и сохранены только для
аудита и планируемой миграции. Они **не** описывают развёртывание Conation и
не должны применяться (`pulumi up`) для локальной разработки или production.
Для production потребуется отдельный Conation tenant, DNS, OAuth-клиенты,
секреты и управляемая миграция; повторное использование старых идентификаторов
или секретов недопустимо.

Локальный passwordless-вход создаёт пользователя по требованию. Статического
администратора и статического пароля в репозитории больше нет.
