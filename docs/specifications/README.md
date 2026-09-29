# Спецификации и статус плана RUS/CTN

Этот каталог описывает безопасную подготовку изолированных PR и локальную интеграцию. Карточка в Fusion, открытый PR, его GitHub checks и код в выбранной local `main` — четыре независимых факта. План не означает, что карточки реализованы, одобрены или слиты.

## Навигация

- [DAG PR-волн, owner/interface/acceptance и уникальный индекс 230 незавершённых карточек](waves.md)
- [Спецификация границ переноса](../spec.md)
- [Текущий план и диагностика / владельцы блокеров](../plan.md)
- [Инвентарь карточек (источник Fusion status, titles и dependencies)](../rus-ctn-inventory.json)
- [Сохранённые исходные проверки status evidence](failed-evidence.json)

### Ticket specs (живые Fusion prompts)

Миссия каждой карточки хранится в prompt исходного checkout `/Users/t/Projects/CTN/.fusion/tasks/`; inventory JSON является датированным снимком, не заменой миссии. Ссылки ниже используют `../../../CTN/.fusion/tasks/...` относительно `docs/specifications/` и работают только в локальном checkout рядом с source tree CTN. Для опубликованных документов mission source должен быть доступен из сгенерированной спецификации карточки; не считать эти sibling-relative пути рабочими GitHub-ссылками.

- Пять независимо проверяемых кандидатов: [RUS-1436](../../../CTN/.fusion/tasks/RUS-1436/PROMPT.md), [RUS-1443](../../../CTN/.fusion/tasks/RUS-1443/PROMPT.md), [CTN-009](../../../CTN/.fusion/tasks/CTN-009/PROMPT.md), [CTN-011](../../../CTN/.fusion/tasks/CTN-011/PROMPT.md), [CTN-176](../../../CTN/.fusion/tasks/CTN-176/PROMPT.md).
- Upstream safety/конвергенция: [RUS-1507](../../../CTN/.fusion/tasks/RUS-1507/PROMPT.md), [RUS-1508](../../../CTN/.fusion/tasks/RUS-1508/PROMPT.md), [RUS-1505](../../../CTN/.fusion/tasks/RUS-1505/PROMPT.md), [RUS-1524](../../../CTN/.fusion/tasks/RUS-1524/PROMPT.md).
- Основы self-host / identity / security: [RUS-1447](../../../CTN/.fusion/tasks/RUS-1447/PROMPT.md), [RUS-1454](../../../CTN/.fusion/tasks/RUS-1454/PROMPT.md), [RUS-1459](../../../CTN/.fusion/tasks/RUS-1459/PROMPT.md).
- Mail/calendar / quota: [RUS-1461](../../../CTN/.fusion/tasks/RUS-1461/PROMPT.md), [RUS-1462](../../../CTN/.fusion/tasks/RUS-1462/PROMPT.md), [RUS-1467](../../../CTN/.fusion/tasks/RUS-1467/PROMPT.md), [RUS-1512](../../../CTN/.fusion/tasks/RUS-1512/PROMPT.md).
- Privacy boundary: [CTN-351](../../../CTN/.fusion/tasks/CTN-351/PROMPT.md) — явно вне текущего бесплатного personal/local scope.
- Активный owner: [CTN-184](../../../CTN/.fusion/tasks/CTN-184/PROMPT.md) — остаётся in progress у текущего владельца.

Для любой другой строки индекса в [waves.md](waves.md#machine-auditable-index-of-230-non-done-cards) локальная ссылка формируется как `../../../CTN/.fusion/tasks/<ID>/PROMPT.md`; individual ticket docs на один уровень глубже используют `../../../../CTN/.fusion/tasks/<ID>/PROMPT.md`. Эти пути работают только в локальном checkout. В опубликованных документах источник миссии должен входить в сгенерированную спецификацию карточки. Если файл в исходном Fusion checkout не найден, не заменять его guess/PR title: зафиксировать отсутствующий источник и определить карточный scope по владельцу.

## Легенда статусов

| Поле | Что утверждает | Чего не утверждает |
|---|---|---|
| **Fusion** (`todo`, `in-review`, `in-progress`, `done`; включая paused reason) | Снимок board/task workflow из inventory либо актуальное состояние live task record, если перепроверено. | Не доказывает, что код написан, PR зеленый/одобрен, или задача попала в local main. |
| **PR / GitHub** (`draft/open/closed/merged`, review, check run status) | Состояние конкретного GitHub PR и его конкретного head SHA. Checks должны быть завершены для проверяемого head; ссылка/номер фиксируются для каждого готового кандидата. | `done` Fusion, старый green run или наличие PR не доказывает актуальный head прошёл checks или принят в main. |
| **local main** (наличие, точные commit SHA и tree SHA) | Проверенное содержимое локальной ветки после последовательного compare-and-swap, подтверждённое точным ref/tree и receipts. | Не описывает corporate remote; corporate origin остаётся READ-only, без push/ref updates. |
| **Backup** (точный object/tree equality) | Backup ref возвращает зафиксированный commit/tree SHA после readback. | Backup не является автоматическим разрешением merge и не заменяется названием ветки без сравнения OID. |
| **Индекс волн** (`W00`–`W11`, `ACTIVE`, `OUT`) | Единственное назначение каждого из 230 non-done IDs в плане: волна, продолжающийся внешний owner, либо исключённая scope карточка. | Не служит состоянием Fusion/PR/main и не говорит о готовности. |

## Неподвижные ограничения

- `origin/main` после подтверждённого upstream sync: `6efb9d2ade28dd5639265c1ac88e8dc46ea377f8`. Pre-sync срез был 8 ahead / 193 behind; это историческая divergence, не актуальный status.
- На 2026-09-29 local main fast-forwarded до `0f002d8aa27cd4e022b71e7da55c58e51fcdaf52`, parents exact origin SHA + прежний main `484c8708a901f74cf34fd74e99df2111f8ceba23`; теперь `main...origin/main` ahead 9, behind 0. Root `.gitignore` modification и отсутствующий `.agents/skills/live-debug` сохранены без изменений.
- Backup `backup/pre-main-sync-20260929-484c8708a` readback совпал с прежним main; `backup/post-sync-origin-main-20260929-6efb9d2ade` readback совпал с fetched origin commit/tree. Synced branch опубликована в private repo; corporate origin не изменялся.
- W00 upstream sync/backup выполнен. При новом upstream SHA пересчитать базу и сделать точный backup до подготовки следующей ветки.
- Пять кандидатов подготавливаются каждый отдельной веткой/PR от свежей базы. Не переносить 5k missing tracked paths, не bulk merge Fusion/task refs, не удалять/восстанавливать пути автоматически.
- Проверки и review — на точном PR head, каждая волна отдельно; незелёный или нерассмотренный кандидат не сливать в local main.
- Единственный local-main writer — release integrator. Main уже синхронизирована по upstream fast-forward; product candidates интегрируются по одному, expected-old + CAS, с backup/readback до каждой отдельной main mutation, без concurrent main writes. Публикация в принадлежащий пользователю private GitHub repo разрешена; запланированные PR не считать существующими до подтверждённого URL/номера. Corporate origin остаётся READ-only.
- Не отправлять дальнейшие обновления на corporate remote. Свободное личное локальное использование находится в scope. Платные HIPAA/compliance promises, certification и gated safeguards из CTN-351 исключены.

## Индекс карточек по волнам

Ниже перечислены все 230 уникальных карточек со статусом не `done`, с тем же единственным назначением, что и в [машиночитаемом индексе волн](waves.md#machine-auditable-index-of-230-non-done-cards). Ссылки ведут на переносимые ticket specs. Вторичный источник — Fusion prompt в sibling checkout `../../../CTN/.fusion/tasks/<ID>/PROMPT.md`; это локальный путь, он не является рабочей ссылкой в опубликованной документации.

### W00
- [RUS-1507](tickets/RUS-1507.md) · [RUS-1508](tickets/RUS-1508.md)
### W01
- [CTN-009](tickets/CTN-009.md) · [CTN-011](tickets/CTN-011.md) · [CTN-176](tickets/CTN-176.md) · [RUS-1436](tickets/RUS-1436.md) · [RUS-1443](tickets/RUS-1443.md)
### W02
- [CTN-001](tickets/CTN-001.md) · [CTN-002](tickets/CTN-002.md) · [CTN-003](tickets/CTN-003.md) · [CTN-004](tickets/CTN-004.md) · [CTN-005](tickets/CTN-005.md)
- [CTN-007](tickets/CTN-007.md) · [CTN-013](tickets/CTN-013.md) · [CTN-014](tickets/CTN-014.md) · [CTN-015](tickets/CTN-015.md) · [CTN-016](tickets/CTN-016.md)
- [CTN-017](tickets/CTN-017.md) · [CTN-020](tickets/CTN-020.md) · [CTN-022](tickets/CTN-022.md) · [CTN-023](tickets/CTN-023.md) · [CTN-027](tickets/CTN-027.md)
- [CTN-028](tickets/CTN-028.md) · [CTN-033](tickets/CTN-033.md) · [CTN-034](tickets/CTN-034.md) · [CTN-035](tickets/CTN-035.md) · [CTN-037](tickets/CTN-037.md)
- [CTN-039](tickets/CTN-039.md) · [CTN-051](tickets/CTN-051.md) · [CTN-056](tickets/CTN-056.md) · [CTN-058](tickets/CTN-058.md) · [CTN-060](tickets/CTN-060.md)
- [CTN-061](tickets/CTN-061.md) · [CTN-063](tickets/CTN-063.md) · [CTN-065](tickets/CTN-065.md) · [CTN-067](tickets/CTN-067.md) · [CTN-068](tickets/CTN-068.md)
- [CTN-078](tickets/CTN-078.md) · [CTN-086](tickets/CTN-086.md) · [CTN-093](tickets/CTN-093.md) · [CTN-107](tickets/CTN-107.md) · [CTN-113](tickets/CTN-113.md)
- [CTN-117](tickets/CTN-117.md) · [CTN-124](tickets/CTN-124.md) · [CTN-125](tickets/CTN-125.md) · [CTN-128](tickets/CTN-128.md)
### W03
- [CTN-143](tickets/CTN-143.md) · [CTN-147](tickets/CTN-147.md) · [CTN-148](tickets/CTN-148.md) · [CTN-154](tickets/CTN-154.md) · [CTN-157](tickets/CTN-157.md)
- [CTN-158](tickets/CTN-158.md) · [CTN-160](tickets/CTN-160.md) · [CTN-163](tickets/CTN-163.md) · [CTN-165](tickets/CTN-165.md) · [CTN-166](tickets/CTN-166.md)
- [CTN-177](tickets/CTN-177.md) · [CTN-183](tickets/CTN-183.md) · [CTN-187](tickets/CTN-187.md) · [CTN-193](tickets/CTN-193.md) · [CTN-194](tickets/CTN-194.md)
- [CTN-195](tickets/CTN-195.md) · [CTN-202](tickets/CTN-202.md) · [CTN-207](tickets/CTN-207.md) · [CTN-210](tickets/CTN-210.md) · [CTN-211](tickets/CTN-211.md)
- [CTN-231](tickets/CTN-231.md) · [CTN-232](tickets/CTN-232.md) · [CTN-233](tickets/CTN-233.md) · [CTN-241](tickets/CTN-241.md) · [CTN-245](tickets/CTN-245.md)
- [CTN-253](tickets/CTN-253.md) · [CTN-254](tickets/CTN-254.md) · [CTN-256](tickets/CTN-256.md)
### W04
- [CTN-274](tickets/CTN-274.md) · [CTN-283](tickets/CTN-283.md) · [CTN-292](tickets/CTN-292.md) · [CTN-299](tickets/CTN-299.md) · [CTN-300](tickets/CTN-300.md)
- [CTN-320](tickets/CTN-320.md) · [CTN-329](tickets/CTN-329.md) · [CTN-332](tickets/CTN-332.md)
### W05
- [CTN-407](tickets/CTN-407.md) · [CTN-411](tickets/CTN-411.md) · [CTN-448](tickets/CTN-448.md) · [CTN-470](tickets/CTN-470.md) · [CTN-477](tickets/CTN-477.md)
- [CTN-486](tickets/CTN-486.md) · [CTN-488](tickets/CTN-488.md) · [CTN-502](tickets/CTN-502.md) · [CTN-503](tickets/CTN-503.md) · [CTN-504](tickets/CTN-504.md)
- [CTN-506](tickets/CTN-506.md) · [CTN-518](tickets/CTN-518.md) · [CTN-546](tickets/CTN-546.md) · [CTN-563](tickets/CTN-563.md)
### W06
- [CTN-583](tickets/CTN-583.md) · [CTN-593](tickets/CTN-593.md) · [CTN-672](tickets/CTN-672.md) · [CTN-700](tickets/CTN-700.md) · [CTN-702](tickets/CTN-702.md)
- [CTN-759](tickets/CTN-759.md) · [CTN-760](tickets/CTN-760.md) · [CTN-779](tickets/CTN-779.md) · [CTN-799](tickets/CTN-799.md) · [CTN-816](tickets/CTN-816.md)
- [CTN-866](tickets/CTN-866.md) · [CTN-913](tickets/CTN-913.md) · [CTN-942](tickets/CTN-942.md) · [CTN-944](tickets/CTN-944.md) · [CTN-947](tickets/CTN-947.md)
- [CTN-971](tickets/CTN-971.md) · [CTN-991](tickets/CTN-991.md) · [CTN-1039](tickets/CTN-1039.md) · [CTN-1043](tickets/CTN-1043.md)
### W07
- [RUS-001](tickets/RUS-001.md) · [RUS-002](tickets/RUS-002.md) · [RUS-011](tickets/RUS-011.md) · [RUS-017](tickets/RUS-017.md) · [RUS-044](tickets/RUS-044.md)
- [RUS-058](tickets/RUS-058.md) · [RUS-134](tickets/RUS-134.md) · [RUS-161](tickets/RUS-161.md) · [RUS-173](tickets/RUS-173.md) · [RUS-217](tickets/RUS-217.md)
- [RUS-616](tickets/RUS-616.md) · [RUS-617](tickets/RUS-617.md) · [RUS-618](tickets/RUS-618.md) · [RUS-619](tickets/RUS-619.md) · [RUS-620](tickets/RUS-620.md)
- [RUS-621](tickets/RUS-621.md) · [RUS-622](tickets/RUS-622.md) · [RUS-623](tickets/RUS-623.md) · [RUS-625](tickets/RUS-625.md) · [RUS-626](tickets/RUS-626.md)
- [RUS-628](tickets/RUS-628.md) · [RUS-630](tickets/RUS-630.md) · [RUS-631](tickets/RUS-631.md) · [RUS-698](tickets/RUS-698.md) · [RUS-1214](tickets/RUS-1214.md)
- [RUS-1242](tickets/RUS-1242.md) · [RUS-1435](tickets/RUS-1435.md) · [RUS-1437](tickets/RUS-1437.md) · [RUS-1438](tickets/RUS-1438.md) · [RUS-1440](tickets/RUS-1440.md)
- [RUS-1441](tickets/RUS-1441.md) · [RUS-1442](tickets/RUS-1442.md)
### W08
- [RUS-1447](tickets/RUS-1447.md) · [RUS-1448](tickets/RUS-1448.md) · [RUS-1449](tickets/RUS-1449.md) · [RUS-1450](tickets/RUS-1450.md) · [RUS-1451](tickets/RUS-1451.md)
- [RUS-1452](tickets/RUS-1452.md) · [RUS-1453](tickets/RUS-1453.md) · [RUS-1454](tickets/RUS-1454.md) · [RUS-1455](tickets/RUS-1455.md) · [RUS-1456](tickets/RUS-1456.md)
- [RUS-1457](tickets/RUS-1457.md) · [RUS-1458](tickets/RUS-1458.md) · [RUS-1459](tickets/RUS-1459.md) · [RUS-1460](tickets/RUS-1460.md)
### W09
- [RUS-1461](tickets/RUS-1461.md) · [RUS-1462](tickets/RUS-1462.md) · [RUS-1463](tickets/RUS-1463.md) · [RUS-1464](tickets/RUS-1464.md) · [RUS-1465](tickets/RUS-1465.md)
- [RUS-1466](tickets/RUS-1466.md) · [RUS-1467](tickets/RUS-1467.md) · [RUS-1468](tickets/RUS-1468.md) · [RUS-1469](tickets/RUS-1469.md) · [RUS-1470](tickets/RUS-1470.md)
- [RUS-1471](tickets/RUS-1471.md)
### W10
- [RUS-1472](tickets/RUS-1472.md) · [RUS-1473](tickets/RUS-1473.md) · [RUS-1474](tickets/RUS-1474.md) · [RUS-1475](tickets/RUS-1475.md) · [RUS-1476](tickets/RUS-1476.md)
- [RUS-1477](tickets/RUS-1477.md) · [RUS-1478](tickets/RUS-1478.md) · [RUS-1479](tickets/RUS-1479.md) · [RUS-1480](tickets/RUS-1480.md) · [RUS-1481](tickets/RUS-1481.md)
- [RUS-1482](tickets/RUS-1482.md) · [RUS-1483](tickets/RUS-1483.md) · [RUS-1484](tickets/RUS-1484.md) · [RUS-1485](tickets/RUS-1485.md) · [RUS-1486](tickets/RUS-1486.md)
- [RUS-1487](tickets/RUS-1487.md) · [RUS-1488](tickets/RUS-1488.md) · [RUS-1489](tickets/RUS-1489.md) · [RUS-1490](tickets/RUS-1490.md) · [RUS-1491](tickets/RUS-1491.md)
- [RUS-1492](tickets/RUS-1492.md) · [RUS-1493](tickets/RUS-1493.md) · [RUS-1494](tickets/RUS-1494.md) · [RUS-1495](tickets/RUS-1495.md) · [RUS-1496](tickets/RUS-1496.md)
- [RUS-1497](tickets/RUS-1497.md) · [RUS-1498](tickets/RUS-1498.md) · [RUS-1499](tickets/RUS-1499.md) · [RUS-1500](tickets/RUS-1500.md) · [RUS-1501](tickets/RUS-1501.md)
- [RUS-1502](tickets/RUS-1502.md) · [RUS-1503](tickets/RUS-1503.md) · [RUS-1504](tickets/RUS-1504.md)
### W11
- [RUS-1505](tickets/RUS-1505.md) · [RUS-1506](tickets/RUS-1506.md) · [RUS-1509](tickets/RUS-1509.md) · [RUS-1510](tickets/RUS-1510.md) · [RUS-1511](tickets/RUS-1511.md)
- [RUS-1512](tickets/RUS-1512.md) · [RUS-1513](tickets/RUS-1513.md) · [RUS-1514](tickets/RUS-1514.md) · [RUS-1515](tickets/RUS-1515.md) · [RUS-1516](tickets/RUS-1516.md)
- [RUS-1517](tickets/RUS-1517.md) · [RUS-1518](tickets/RUS-1518.md) · [RUS-1519](tickets/RUS-1519.md) · [RUS-1520](tickets/RUS-1520.md) · [RUS-1521](tickets/RUS-1521.md)
- [RUS-1522](tickets/RUS-1522.md) · [RUS-1523](tickets/RUS-1523.md) · [RUS-1524](tickets/RUS-1524.md) · [RUS-1525](tickets/RUS-1525.md) · [RUS-1526](tickets/RUS-1526.md)
- [RUS-1527](tickets/RUS-1527.md) · [RUS-1528](tickets/RUS-1528.md)
### ACTIVE
- [CTN-184](tickets/CTN-184.md)
### OUT
- [CTN-351](tickets/CTN-351.md) · [CTN-539](tickets/CTN-539.md)
