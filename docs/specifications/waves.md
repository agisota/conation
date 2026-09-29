# DAG подготовки PR-волн RUS/CTN

Это план дальнейшей работы по карточкам инвентаря, а не утверждение, что они уже реализованы или приняты. Входы: [снимок инвентаря](../rus-ctn-inventory.json), [общий план и диагностика](../plan.md), [спецификация границ](../spec.md). Истина о миссии карточки — Fusion prompt `CTN/.fusion/tasks/<ID>/PROMPT.md`; инвентарь — снимок статуса на 2026-09-25. Ссылки на prompts из этого каталога работают только в локальном checkout рядом с исходным каталогом `CTN`; в опубликованной документации миссия должна быть доступна из сгенерированной спецификации каждой карточки.

## Зафиксированные исходные условия

- Подтверждённый fetched корпоративный `origin/main`: `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`. На **срезе до sync** локальная main была на 8 commits ahead и 193 behind; это историческая база, не текущее состояние.
- На 2026-09-29 локальная main уже fast-forwarded от `484c8708a901f74cf34fd74e99df2111f8ceba23` до `0f002d8aa27cd4e022b71e7da55c58e51fcdaf52` (parents: exact origin SHA + old local main); сейчас `main...origin/main` = ahead 9, behind 0. Изменения пользователя в root `.gitignore` и отсутствующий `.agents/skills/live-debug` сохранены без изменений.
- До этого fast-forward прочитан backup `backup/pre-main-sync-20260929-484c8708a`, равный прежнему main. Post-sync backup `backup/post-sync-origin-main-20260929-6efb9d2ade` прочитан и равен exact fetched origin commit/tree. Синхронизированная branch опубликована в private repo; корпоративный origin не изменялся.
- Разность 8/193 нужно читать как pre-sync snapshot, не как текущую divergence. Не делать reset/rebase и не терять восемь старых local commits: текущий synced main сохраняет прежний main как parent.
- `W00` выполнен для указанного SHA. Если корпоративный `origin/main` изменится, повторить sync в изолированном checkout, прочитать новый exact-origin backup и пересчитать divergence до подготовки следующих веток.
- Не запускать автоматический `merge` всех task/Fusion веток и не принимать отсутствующие тысячи путей за удаления. В частности, отсутствие 5k+ tracked paths в damaged worktree не даёт права staged/delete/restore/mass-copy этих путей. Переносить только небольшой доказанный task-specific diff с source SHA и ограничением A/M путей.
- Все кандидатные ветки создаются независимо от свежего upstream SHA (или от явно принятой зависимости), с одним task-owner на ветку. Планируемые кандидаты не означают, что PR уже создан. Публикация в принадлежащий пользователю private GitHub repo разрешена; corporate origin остаётся READ-only — не выполнять туда push или иные remote ref updates. GitHub refs/PR numbers — источники статуса, не доказательство готовности.

## Граф зависимостей и параллелизм

```text
Early prerequisite lane (card gates, not wave barriers):
  RUS-1461 (W09) ──gates──> RUS-1460 (W08)
  RUS-1512 (W11) ──gates──> RUS-1465 (W09) and RUS-1496 (W10)
  RUS-1528 (W11) ──gates──> RUS-1496 (W10)

W00 upstream sync + exact-origin backup + isolated checkout — DONE for 6efb9d2ade28dd5639265c1ac88e8dc46ea377f8
W01–W11: independently schedulable card waves; only the specific dependent card waits for its listed prerequisite.

Each ready candidate → focused checks + independent review + GitHub/check evidence
→ before each local-main change: exact backup → CAS of one candidate
→ after upstream sync: separate backup of exact origin/main SHA/tree
```
The lane above is the complete cross-wave prerequisite view for these three review findings, not a sequence of whole waves. No wave waits wholesale on a later wave; unrelated cards remain independently schedulable.
The card-level dependency fields were checked in `.fusion/tasks/<ID>/task.json`: `RUS-1460` lists `RUS-1461`; `RUS-1465` lists `RUS-1512`; `RUS-1496` lists `RUS-1512` and `RUS-1528`. These edges gate only the named dependent card. Other dependencies remain as listed in their task records and in the inventory.
`RUS-1441` is Redis relay PR #6856, which is MERGED; its task record has no dependencies. It has no MCP header-storage prerequisite. Do not conflate it with `RUS-161`, whose separate external dependency remains to be verified.

Стрелка между карточками является блокирующей **только** когда зависимость указана в inventory/task spec либо интерфейс действительно нужен потребителю. Общая зона файлов, продуктовая тематика, соседние номера или одинаковый PR family сами по себе — overlap/координация, а не DAG-ребро. Карточные зависимости, известные по inventory: `CTN-056 → CTN-060`; `CTN-157 → CTN-158`; `RUS-620 → RUS-621`; `RUS-1448 → RUS-1447`; `RUS-1449 → RUS-1448`; `RUS-1450 → RUS-1447`; `RUS-1451/1452/1453/1454 → RUS-1448`; `RUS-1455 → RUS-1454`; `RUS-1456 → RUS-1454 + RUS-1455`; `RUS-1457 → RUS-1456`; `RUS-1458 → RUS-1452`; `RUS-1459 → RUS-1451 + RUS-1457`; `RUS-1460 → RUS-1459 + RUS-1461`; `RUS-1461 → RUS-1448 + RUS-1449 + RUS-1451 + RUS-1457 + RUS-1459`; mail `RUS-1462–1466` и календарь `RUS-1467–1469` — строго по перечисленным ниже ticket deps; `RUS-1470/1471` canvas, `RUS-1472–1504` UI/brand/localization/agents/calls — строго по inventory deps; `RUS-1509` требует `RUS-1529`; `RUS-1510` требует mail `RUS-1461–1466`; `RUS-1511` требует `RUS-1510`; `RUS-1512` требует `RUS-1453 + RUS-1450`; `RUS-1513` требует `RUS-1470`; `RUS-1514` требует calls `RUS-1482–1485`; `RUS-1515` требует указанные calendar/calls зависимости; `RUS-1516` требует `RUS-1515 + RUS-1489 + RUS-1492`; `RUS-1518` требует `RUS-1459 + RUS-1517`; `RUS-1519` требует `RUS-1470 + RUS-1471 + RUS-1525`; `RUS-1520` требует `RUS-1459 + RUS-1489 + RUS-1490`; `RUS-1521` требует `RUS-1458 + RUS-1459`; `RUS-1522` требует `RUS-1454–1456`; `RUS-1523` требует `RUS-1505`; `RUS-1524` требует `RUS-1507 + RUS-1508`; `RUS-1525` требует `RUS-1459`; `RUS-1527` требует `RUS-1515 + RUS-1467 + RUS-1468`; `RUS-1494/1496` — только после своих полных inventory prerequisites. Проверять полный актуальный список зависимостей в inventory перед dispatch, не выводить их из этого сокращённого описания.

Отдельно блокировать overlap, не создавать ложную зависимость: `RUS-1242` пересекается с CTN-332 и новой upstream реализацией; `CTN-011` — общий calendar/link classifier; `CTN-007/014/563` имеют неполные consumer/schema slices; CTN/RUS feedback PR могут касаться одних и тех же файлов. Перед стартом составлять path-level overlap map; делить ветки по реальным интерфейсам, а при конфликте назначить одного owner и сериализовать только затронутые файлы. Для `RUS-161` отдельно проверить заявленный внешний header-storage dependency; он не распространяется на `RUS-1441`.

Сохранить диагностическую provenance отдельно от DAG: [`failed.md`](failed.md) содержит 32 карточки со статусом `in-review/failed` (Fusion workflow status, не доказательство CI failure) и актуализированную выборку состояния/head 23 связанных PR на 2026-09-29. Это историческая evidence-матрица, не текущий CI/review verdict; не терять её и не выводить из неё wave dependencies.

## Волны

Для всех волн общий порядок: отдельная ветка от актуальной базы → сверка prompt, исходного PR diff и origin change → реализация недостающего поведения, а не только перенос diff → focused tests по boundary/ошибкам → smoke изменённого пути → diff review против base и проверка отсутствия удалённых tracked paths → независимое review → сохранить точные head SHA, план публикации или фактические PR URL/номера, checks и review result. Не считать карточку `done`, если Fusion отметила review/план, но реализация не попала в требуемую local main. Не сливать карточные изменения друг с другом, если нет доказанной зависимости и согласованного интерфейса.

| Волна | Вход / владелец и интерфейс | Планируемый результат / критерий приёмки |
|---|---|---|
| **W00 — upstream and safety setup** (one-off sync DONE for the recorded SHA; ongoing operational gates PENDING) | Release integrator; `origin/main` SHA `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`; verified backup refs/readback above. | Completed once: local `main`=`0f002d8aa27cd4e022b71e7da55c58e51fcdaf52`, exact parents origin SHA + prior main; `backup/pre-main-sync-20260929-484c8708a` equals prior main, `backup/post-sync-origin-main-20260929-6efb9d2ade` equals fetched origin commit/tree. Private publication only; corporate origin unchanged. Pre-sync 8/193 is historical, not current divergence. **Still pending:** `RUS-1507` recurring three-hour upstream sync and `RUS-1508` pre-every-merge backup are separate operational contracts, not completed by this one-off. Exit `RUS-1507` only after scheduled `0 */3 * * *` runs and its pre-rebase retained backup, successful content availability, dirty-tree/conflict refusal, and no-upstream-push behavior are evidenced. Exit `RUS-1508` only after every actual Fusion/main-update path is gated under integrator lock, a durable `backup/pre-merge-*` equals old main before mutation, and bypass paths fail closed. Until then these remain PENDING; do not claim merge safety or unfreeze product merges.
| **W01 — пять узких кандидатов** (параллельно, 5 отдельных PR) | Пять task owners: paste `RUS-1436`, draft persistence `RUS-1443`, SDK/manual CRM import `CTN-009`, destinations/calendar `CTN-011`, Duplicate as Task `CTN-176`; интегратор предоставляет только свежий upstream base и source provenance. См. plan.md для уже известных ремонтов и незавершённого UI/authenticated smoke. | Каждый кандидат — независимо воспроизводимый PR, только его подтверждённые A/M файлы, без любых missing paths. Повторно портировать/проверить подход на текущем upstream; реализовать отсутствующие acceptance миссии, focused тесты и smoke; снять красные проверки именно на новом head или честно оставить PR блокированным. Не переиспользовать старый PR head как готовый. W01 может идти параллельно W02–W07 после W00; не блокирует остальные домены. |
| **W02 — CTN-001…128: MCP, email и ранние feedback PR** (раздельные PR) | CTN task owners по каждой карточке, review-owner по MCP/email/API. Изоляция MCP schema/auth/service контрактов от composer/mail потребителей. Явная внутренняя зависимость: CTN-060 → CTN-056. | Инвентаризировать prompt + PR head/checks; восстановить каждую завершённую feature в актуальной базе только при подтверждённом diff. Acceptance — соответствующая карточная миссия, контрактный тест/API/client coverage, negative/error path и smoke. CTN-004 — сначала подтвердить продуктовое решение о дубликате; не строить feature по paused duplicate. CTN-060 должен быть принят, прежде чем закрывать зависимый CTN-056. Не объединять всю волну в одну большую PR. |
| **W03 — CTN-143…256: agent/session, navigation, reminders, documents** | UI/agents owners работают параллельно с W02 по непересекающимся slices; Split Router owner публикует API интерфейс `CTN-158` до потребителя `CTN-157`. | Каждый feedback PR адресует все текущие review comments и CI на новом head. Проверять переходы маршрутов, lifecycle/session identity, persisted state, keyboard/mobile и negative states. `CTN-184` остаётся ACTIVE и принадлежит текущему owner; другие агенты не менять его дерево, PR или задачу. Сходство документов/agent surfaces требует overlap map, не общий merge. |
| **W04 — CTN-274…332: календарь, ownership, mobile и база** | Именованные owners calendar/collab/backend; интерфейсы calendar API, ownership backfill и SQL/SDK согласовать до consumer waves. | Пересмотреть PR #6608/#6581/#6589/#6677 и связанные спецификации; schema migration отдельно от обязательных consumers, API/SDK совместимость подтверждена, календарные permissions/time zones и ownership/backfill boundary проверены. `CTN-332` координировать с `RUS-1242` из-за реального sync-service overlap, но независимые файлы разрешают параллельную реализацию. |
| **W05 — CTN-407…563: local dev, CI, CRM, mobile and billing** | Owners local-dev/infra, CRM, mobile preview and onboarding; unique writer for cert/CORS boundary and CRM ownership. | Each in-scope card implements, not merely republishes, its PR. Infra/migrations require safe dry-run, negative control, reproducible local environment and verified rollback; CRM requires all consumers/ownership. `CTN-539` is DECLINED paid AI billing/Stripe scope: moved to `OUT`, counted, and excluded from PR execution. `CTN-351` remains `OUT` under the existing no-paid-work policy. |
| **W06 — CTN-583…1043: оставшиеся feature/feedback slices** | Отдельные task owners по observability/security/self-host/UI/infra/agents; независимый review-owner. | По каждой PR-карточке подтвердить source PR, живые review comments, CI и связи до ветвления. Сохранять узкую область. Для auth redirect проверить allowlist/negative tests; self-host — воспроизводимость; search/navigation/accessibility — consumer behavior. Cross-cutting changes сначала дать owner API контракт, потом независимые потребители. |
| **W07 — остальные ранние/импортированные RUS PR** | RUS owners and source PR reviewers. Here are task PR cards outside W01 and the later roadmap numbering. `RUS-620 → RUS-621`; `RUS-1435` is a separate decision on potentially destructive legacy scripts. | Validate each source PR, current base/head, checks, reviews and scope; do not infer readiness from `commitsAhead`. Keep obsolete scripts out of execution pending safe review. `RUS-1441` is already MERGED as Redis relay PR #6856 and has no dependency; verify its task/feedback disposition without inventing a header-storage block. Only `RUS-161` retains its separate external dependency question. |
| **W08 — RUS-1447…1460: build, self-host, registry, identity/security** | Build/platform owner defines reproducible build (`RUS-1447`); later owners consume versioned contracts. | Follow task-level prerequisites rather than wave ordering. `RUS-1460` is in W08 but is gated specifically by `RUS-1461` in W09; other W08 cards remain independently schedulable. Require clean-checkout build proof, negative access/config tests, dependency-owner approval and rollback plan; do not claim CalDAV/JMAP or production readiness early. |
| **W09 — RUS-1461…1471: first-party mail/calendar/canvas** | Mail owner owns provider-neutral IDs + Stalwart/JMAP API; calendar owner CalDAV; Canvas owner storage/ACL. | `RUS-1461` is an early prerequisite card for `RUS-1460`, not a reason to block all W08. `RUS-1465` specifically waits for `RUS-1512` (W11) per task.json; other eligible cards may proceed. Tests must prove mailbox sync/draft/send/attachments/quota and visible status; CalDAV recurrence/RSVP/timezone; Canvas durability/export/ACL, with permissions/isolation/error recovery. |
| **W10 — RUS-1472…1504: theme, identity surfaces, localization, agents/calls, QA** | Design tokens, localization/catalog, built-in-agent/permissions and calls owners; UI/API interfaces versioned. | Screenshots/contrast/state regression; localization missing-key/error/date/inflection/Cyrillic search; agents exact profiles, user isolation and explicit confirmation; calls ACL/consent/lifecycle and operator-owned storage. `RUS-1496` alone is gated by listed prerequisites including `RUS-1512` and `RUS-1528` in W11; do not hold the whole wave. |
| **W11 — RUS-1505/1506/1509…1528: local Conation use, sync routines, dashboards, meetings, operations** | Personal operator/product owner defines personal-local use; backend owner dashboard CAS; Fusion owner sync schedule; security owner rotation. Each feature has its own owner/interface. | Personal/local use only, with no paid HIPAA/compliance scope. Work from actual task-level dependencies: `RUS-1512` gates `RUS-1465` and `RUS-1496`; `RUS-1528` gates `RUS-1496`. `RUS-1507` and `RUS-1508` are pending W00 operational gates, not completed by the one-off sync. `RUS-1509` depends on completed `RUS-1529` replan results; do not repeat its implementation. |

### Владельцы, handoff и acceptance contract

- **Card owner** (по одному на каждый PR): читает живой Fusion prompt и актуальный PR, отвечает за недостающую реализацию и тесты, прикладывает `source task ID`, исходные `source SHA`, новый `base/head SHA`, touched-path list, тест/smoke commands и наблюдения, причины любого переноса/непереноса. Не меняет чужой task state.
- **Domain owner**: до параллельной реализации фиксирует минимальный API/schema/interface и проверяет файл-overlap map; владеет shared interface и миграцией. Объявляет dependency как edge только при фактическом блокирующем контракте.
- **Independent reviewer**: смотрит PR против заявленной base, проверяет корректность/безопасность и no-delete boundary, записывает review ref/result и не является автором PR.
- **Release integrator**: ведёт единственную последовательную очередь обновления local `main`; worker/candidate owners работают параллельно, но main пишет только интегратор. Перед **каждой** main mutation сохранить и прочитать обратно backup ref, точно равный текущему ожидаемому `main` commit/tree; затем непосредственно перед изменением проверить `main == expectedOld` и CAS-обновить ref. Проверить итоговую историю/tree, остановиться при несовпадении. Отдельный post-sync backup exact corporate origin SHA/tree сохраняет upstream baseline.
- **Per-wave acceptance**: для каждого дочернего PR — acceptance миссии карточки, focused behavioral tests (happy path, важный boundary/error, invariant/transition), smoke changed path, clean scoped review, GitHub URL/number и head SHA; актуальный check run завершился на этом head и status записан (pass/fail/pending, workflow + run URL). PR с неуспешными/ожидающими checks либо неразрешённым review остается отдельным кандидатом, не попадает в main CAS queue.

## Серийная local-main интеграция и post-sync backup

Подготовка candidate PR и проверки могут идти параллельно. Публикация candidate PR в принадлежащий пользователю private GitHub repo разрешена; сам факт публикации не означает прохождение checks/review или готовность к интеграции. Corporate origin используется только для чтения и остаётся без push/remote ref updates.

После upstream sync сохранить post-sync backup, который указывает на **точный fetched corporate `origin/main` commit SHA** и чьё tree SHA совпадает с ним. Зафиксировать fetch SHA, backup ref, commit SHA, tree SHA, время и результат readback. Эта отдельная upstream-baseline не заменяет backup local `main`.

Интеграция local `main` последовательна, с одним writer. Для каждой отдельной main mutation:

1. Зафиксировать проверенный candidate head, review и checks. Подготовить узкий candidate от текущего local `main` с only-approved file changes; никакой транзитивной интеграции по номеру wave.
2. **До CAS/main mutation** создать резервный ref/checkout текущего `main`; прочитать его обратно и подтвердить равенство commit SHA и tree SHA с ожидаемым `old` main. Зафиксировать оба OID и backup ref.
3. Непосредственно перед изменением проверить `main == expectedOld`; выполнить compare-and-swap (CAS), без force update. После изменения проверить новую историю/tree и сохранность созданного pre-mutation backup. Только затем переходить к следующему кандидату.
4. При race, несовпадении backup или CAS — остановиться и повторно проанализировать состояние, не повторять вслепую. Если corporate origin продвинулся, выполнить новый sync в изолированный checkout, сохранить новый точный post-sync origin backup и пересчитать базу; не изменять corporate remote.

Не публиковать изменения на corporate origin и не удалять/переписывать backup refs или task branches. Локальная `main` может обновляться только описанным последовательным CAS с backup, сделанным до каждой мутации.
## Готовые карточки: статус — отдельный контроль, не очередь интеграции

Инвентарь содержит 21 `done`. Это проверка статуса 21 карточки/PR, а не основание повторно переносить их в candidates и не доказательство, что соответствующий код присутствует на выбранной local main. Для карточек с номером PR читать точный GitHub PR head и checks; для карточек без номера — подтвердить task artifact/фактическую историю через разрешённый источник. Отражать независимые поля Fusion status, PR review/check status, и наличие в local main. Нельзя проставлять PASS по одному только `done`.

| ID | Снимок inventory / известная ссылка PR | Required status check |
|---|---|---|
| CTN-018 | done; PR не указан | Подтвердить фактический код/артефакт и local-main присутствие |
| CTN-021 | done; PR не указан | Подтвердить артефакт/решение и local-main присутствие |
| CTN-057 | done; #6828 | PR head/checks и локальный tree отдельно |
| CTN-059 | done; #6827 | PR head/checks и локальный tree отдельно |
| CTN-062 | done; #6824 | PR head/checks и локальный tree отдельно |
| CTN-064 | done; #6822 | PR head/checks и локальный tree отдельно |
| CTN-066 | done; #6821 | PR head/checks и локальный tree отдельно |
| CTN-138 | done; #6748 | PR head/checks и локальный tree отдельно |
| CTN-155 | done; #6731 | PR head/checks и локальный tree отдельно |
| CTN-159 | done; #6726 | PR head/checks и локальный tree отдельно |
| CTN-199 | done; #6685 | PR head/checks и локальный tree отдельно |
| CTN-200 | done; #6684 | PR head/checks и локальный tree отдельно |
| CTN-223 | done; #6661 | PR head/checks и локальный tree отдельно |
| CTN-230 | done; #6654 | PR head/checks и локальный tree отдельно |
| CTN-235 | done; #6648 | PR head/checks и локальный tree отдельно |
| CTN-240 | done; #6643 | PR head/checks и локальный tree отдельно |
| CTN-275 | done; #6607 | PR head/checks и локальный tree отдельно |
| RUS-119 | done; #5633 | PR head/checks и локальный tree отдельно |
| RUS-1439 | done; #6853 | PR head/checks и локальный tree отдельно |
| RUS-1444 | done; #6848 | PR head/checks и локальный tree отдельно |
| RUS-1529 | done; no PR specified | Replan artifact/readback, not product implementation |

## Machine-auditable index of 230 non-done cards

Одна whitespace-separated ID на запись индекса; строка `wave` — её единственное назначение. Для аудита извлечь `CTN-[0-9]+|RUS-[0-9]+` только из этого блока, проверить 230 строк, 230 различных значений и сверить с каждой inventory task, где `column != done`. `ACTIVE` входит в эти 230, но не переназначается; `OUT` явно учтён, но не исполняется. Локально, из каталога `docs/specifications/`, mission prompt находится по `../../../CTN/.fusion/tasks/<ID>/PROMPT.md`; individual ticket docs на один уровень глубже используют `../../../../CTN/.fusion/tasks/<ID>/PROMPT.md`. Эти sibling-relative ссылки доступны только в локальном checkout. Для опубликованных документов mission source должен быть включён в сгенерированную спецификацию соответствующей карточки; не полагаться на локальные sibling-ссылки. Статус Fusion/source PR остаётся в inventory snapshot и live GitHub; не выводить состояние PR/main из индекса.

```text
wave W00
RUS-1507 RUS-1508
wave W01
CTN-009 CTN-011 CTN-176 RUS-1436 RUS-1443
wave W02
CTN-001 CTN-002 CTN-003 CTN-004 CTN-005 CTN-007 CTN-013 CTN-014 CTN-015 CTN-016 CTN-017 CTN-020 CTN-022 CTN-023 CTN-027 CTN-028 CTN-033 CTN-034 CTN-035 CTN-037 CTN-039 CTN-051 CTN-056 CTN-058 CTN-060 CTN-061 CTN-063 CTN-065 CTN-067 CTN-068 CTN-078 CTN-086 CTN-093 CTN-107 CTN-113 CTN-117 CTN-124 CTN-125 CTN-128
wave W03
CTN-143 CTN-147 CTN-148 CTN-154 CTN-157 CTN-158 CTN-160 CTN-163 CTN-165 CTN-166 CTN-177 CTN-183 CTN-187 CTN-193 CTN-194 CTN-195 CTN-202 CTN-207 CTN-210 CTN-211 CTN-231 CTN-232 CTN-233 CTN-241 CTN-245 CTN-253 CTN-254 CTN-256
wave W04
CTN-274 CTN-283 CTN-292 CTN-299 CTN-300 CTN-320 CTN-329 CTN-332
wave W05
CTN-407 CTN-411 CTN-448 CTN-470 CTN-477 CTN-486 CTN-488 CTN-502 CTN-503 CTN-504 CTN-506 CTN-518 CTN-546 CTN-563
wave W06
CTN-583 CTN-593 CTN-672 CTN-700 CTN-702 CTN-759 CTN-760 CTN-779 CTN-799 CTN-816 CTN-866 CTN-913 CTN-942 CTN-944 CTN-947 CTN-971 CTN-991 CTN-1039 CTN-1043
wave W07
RUS-001 RUS-002 RUS-011 RUS-017 RUS-044 RUS-058 RUS-134 RUS-161 RUS-173 RUS-217 RUS-616 RUS-617 RUS-618 RUS-619 RUS-620 RUS-621 RUS-622 RUS-623 RUS-625 RUS-626 RUS-628 RUS-630 RUS-631 RUS-698 RUS-1214 RUS-1242 RUS-1435 RUS-1437 RUS-1438 RUS-1440 RUS-1441 RUS-1442
wave W08
RUS-1447 RUS-1448 RUS-1449 RUS-1450 RUS-1451 RUS-1452 RUS-1453 RUS-1454 RUS-1455 RUS-1456 RUS-1457 RUS-1458 RUS-1459 RUS-1460
wave W09
RUS-1461 RUS-1462 RUS-1463 RUS-1464 RUS-1465 RUS-1466 RUS-1467 RUS-1468 RUS-1469 RUS-1470 RUS-1471
wave W10
RUS-1472 RUS-1473 RUS-1474 RUS-1475 RUS-1476 RUS-1477 RUS-1478 RUS-1479 RUS-1480 RUS-1481 RUS-1482 RUS-1483 RUS-1484 RUS-1485 RUS-1486 RUS-1487 RUS-1488 RUS-1489 RUS-1490 RUS-1491 RUS-1492 RUS-1493 RUS-1494 RUS-1495 RUS-1496 RUS-1497 RUS-1498 RUS-1499 RUS-1500 RUS-1501 RUS-1502 RUS-1503 RUS-1504
wave W11
RUS-1505 RUS-1506 RUS-1509 RUS-1510 RUS-1511 RUS-1512 RUS-1513 RUS-1514 RUS-1515 RUS-1516 RUS-1517 RUS-1518 RUS-1519 RUS-1520 RUS-1521 RUS-1522 RUS-1523 RUS-1524 RUS-1525 RUS-1526 RUS-1527 RUS-1528
wave ACTIVE
CTN-184
wave OUT
CTN-351 CTN-539
```

`CTN-351` and `CTN-539` remain counted because neither is done, but both are explicitly outside execution. `CTN-351` is excluded from this free personal/local roadmap: paid HIPAA/compliance safeguards, claims, certification, or paid-workspace gating are not authorized. `CTN-539` is declined paid AI billing/Stripe scope; do not implement or create a PR. Keep both `OUT` until separately authorized. `CTN-184` remains current-owner in progress and must not be claimed as completed by these waves.
