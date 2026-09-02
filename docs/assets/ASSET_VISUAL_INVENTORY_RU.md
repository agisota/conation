# Визуальный реестр продуктовых ассетов — batch 1

Дата ручной проверки: 2026-09-02. Это первая ограниченная партия: ровно 73 наиболее заметных пользователю production-ассета из [`ASSET_MACHINE_INDEX.tsv`](./ASSET_MACHINE_INDEX.tsv). Точное членство партии дублирует машиночитаемый [`ASSET_VISUAL_INVENTORY_BATCH1.tsv`](./ASSET_VISUAL_INVENTORY_BATCH1.tsv). Все 73 файла были открыты и визуально проверены; GIF № 42 проверен по всем 66 кадрам. Тестовые fixtures, email-rendering snapshots, сгенерированные Android/Apple/Tauri-копии и внешние захваченные страницы не включены.

`alpha: да` означает наличие альфа-канала или прозрачного SVG-холста, а не гарантированное наличие полупрозрачных пикселей. `Статика` у SVG означает отсутствие обнаруженной временной анимации. Для SVG с SMIL число дискретных кадров неприменимо. OCR ниже ручной и выборочный: он фиксирует видимый бренд-долг, но не заменяет исходный текст интерфейса.

Статусы происхождения и лицензии:

- **U** — пришло из upstream-репозитория Macro. Репозиторий распространяется по AGPLv3, но отдельное разрешение на товарный знак/изображение в самом файле не найдено; статус таких прав надо подтвердить.
- **C** — создано в рамках миграции Conation. Отдельная asset-лицензия не записана; авторство/правообладание надо зафиксировать перед публичным релизом.
- **T** — знак стороннего сервиса. Это товарный знак соответствующего владельца; в репозитории нет отдельной лицензии, нужны актуальные brand guidelines.
- **S** — скриншот интерфейса upstream-продукта. Отдельной лицензии нет; дополнительно требуется проверка персональных данных, чужих логотипов и устаревших обещаний.
- **unknown** — происхождение по репозиторию надёжно не установлено.

## Канонические masters, предоставленные пользователем

Эти файлы появились позже снимка `ASSET_MACHINE_INDEX.tsv`, поэтому они не входят в счётчик 73 и не дублируются как новые копии:

- `apps/web/public/brand/conation-app-icon-master-v1.png` — 1254×1254, SHA-256 `111156e7dec032c9725f5efe7ad94bebe07f00e4dc9a537e62f6a83f59030dea`.
- `apps/web/public/brand/conation-combined-lockup-master-v1.png` — 2172×724, SHA-256 `974b4c71965df3e2266c74d6545621bc580b4270d12aa1512d31a7a2d46ce453`.
- `apps/web/public/brand/conation-wordmark-master-v1.png` — 2172×724, SHA-256 `a51ecd45281efc1976cec6b3ab050e29f4de8657fac0bef2573375f4cba0e5e4`.

Визуально это чёрная квадратная app-иконка с объёмными серебристыми орбитами и шаром; бело-серебристый wordmark `conation.dev`; combined lockup объединяет знак и wordmark. Это пользовательские originals; отдельный license statement рядом с файлами пока отсутствует. Алиасы `conation-orbit-icon-master-v1.png` и `conation-wordmark-dark-master-v1.png` имеют те же байты, поэтому отдельными активами не считаются.

Активная документация теперь использует проверенные производные:

- `apps/docs/brand/conation-favicon.png` — точная копия 32×32 web-derivative квадратного master, SHA-256 `14bebeecf77a93f5d28af360d5005651f5717d060da4b70f549a0c88dedb32ed`;
- `apps/docs/brand/conation-app-icon-master-v1.png` — точная копия квадратного master для светлой темы, SHA-256 `111156e7dec032c9725f5efe7ad94bebe07f00e4dc9a537e62f6a83f59030dea`;
- `apps/docs/brand/conation-combined-lockup-master-v1.png` — точная копия combined master, SHA-256 `974b4c71965df3e2266c74d6545621bc580b4270d12aa1512d31a7a2d46ce453`.

`apps/docs/docs.json` использует квадратный знак на светлой теме и горизонтальный lockup на строгой тёмной теме. Старые SVG № 1–3 оставлены только как неиспользуемые исторические артефакты с disposition `replace_required`; они больше не являются активными favicon/logo.

## 1. Бренд, публичные изображения и аватары

### 1. `apps/docs/favicon.svg`

- Техника: SVG, 174×174, 397 B, alpha: да, статика, SHA-256 `dd24f73a068ef33f8fd78c0eb460381f8d9896d07c2d4307e7f8e08281be1f75`.
- Назначение: favicon документации; потребитель `apps/docs/docs.json` для обеих тем.
- Вид/OCR: оранжевый геометрический знак Macro в форме составной буквы M на прозрачном квадрате; текста нет.
- Тема/a11y: хорошо различим на тёмном фоне, на светлом цвет остаётся заметным; декоративный favicon не должен быть единственным носителем названия.
- Происхождение/лицензия: **U**; явный остаток старого бренда, подлежит замене на master Conation.

### 2. `apps/docs/logo/dark.svg`

- Техника: SVG, 24×24, 394 B, alpha: да, статика, SHA-256 `c9fe92e58c00f65998d5548170046268e778c75cc93b1ed224b46ec8833ee7fb`.
- Назначение: логотип документации в тёмной теме; `apps/docs/docs.json`.
- Вид/OCR: тот же ломаный знак M, заливка тёплая почти белая; текста нет.
- Тема/a11y: высокий контраст на тёмном фоне, почти исчезает на белом; использовать только в назначенной теме и с текстовым названием рядом.
- Происхождение/лицензия: **U**, старый Macro mark; отдельный trademark grant неизвестен.

### 3. `apps/docs/logo/light.svg`

- Техника: SVG, 24×24, 394 B, alpha: да, статика, SHA-256 `9f26495ba76746d3d05953d872c9bf0a09dc01a7e6d6470aa51915d7b268b967`.
- Назначение: логотип документации в светлой теме; `apps/docs/docs.json`.
- Вид/OCR: чёрный геометрический знак M на прозрачном фоне; текста нет.
- Тема/a11y: высокий контраст на светлом фоне, теряется на чёрном; требуется тематическое переключение и доступное имя продукта.
- Происхождение/лицензия: **U**, старый Macro mark.

### 4. `apps/web/public/crosshair-cursor.svg`

- Техника: SVG, 32×32, 1,514 B, alpha: да, статика, SHA-256 `4a8876e55e90e129273f4b879e1d4fb5b6e201955468a56fc96ab6be55ea06e5`.
- Назначение: пользовательский crosshair-cursor; прямой consumer по имени не найден, в canvas/color-picker сейчас встречается CSS `cursor-crosshair`.
- Вид/OCR: четыре вытянутых плеча с чёрно-белой двойной окантовкой и круглым центром; текста нет.
- Тема/a11y: двойная обводка остаётся видимой на светлом и тёмном; hotspot из файла не следует, поэтому нужна проверка фактической точки наведения.
- Происхождение/лицензия: **U**; авторство неизвестно.

### 5. `apps/web/public/ness.png`

- Техника: PNG, 420×416, 40,425 B, alpha: да, 1 кадр, SHA-256 `1d35793639b4df7e42c0fdf45ddd5d3300b20ca4381964c29b11f841b86ea495`.
- Назначение: публичный legacy-аватар; текущая ссылка в production-коде не найдена.
- Вид/OCR: контурная фиолетово-малиновая иллюстрация массивного фантастического персонажа в худи, с золотистой цепью/эмблемой и предметом в руках; маленькая подпись автора внизу неразборчива.
- Тема/a11y: тонкие линии и прозрачный фон плохо читаются на пёстрой подложке; образ не сообщает роль пользователя.
- Происхождение/лицензия: **unknown**; возможное стороннее character art, нельзя публиковать без проверки прав.

### 6. `apps/web/public/sam.png`

- Техника: PNG, 400×366, 167,569 B, alpha: да, 1 кадр, SHA-256 `a7887c1496298231167cb7e0e58b48671ce7f27cf578c22d072ac80b7d90f111`.
- Назначение: публичный legacy-аватар; текущая ссылка в production-коде не найдена.
- Вид/OCR: негативно-инвертированная цианово-белая версия того же массивного персонажа в худи; на груди синяя угловатая эмблема, текста нет.
- Тема/a11y: резкий неоновый контраст, детали теряются в малом круглом avatar crop; не полагаться на цвет для идентификации.
- Происхождение/лицензия: **unknown**, потенциальное стороннее character art.

### 7. `apps/web/public/teo.png`

- Техника: PNG, 400×366, 128,273 B, alpha: нет, 1 кадр, SHA-256 `7e2c0de16f526a770ff2541d6cbea333d74a15352f9c0f54113eb07a3fc84d56`.
- Назначение: публичный legacy-аватар; текущая ссылка в production-коде не найдена.
- Вид/OCR: полноцветный вариант персонажа: красно-розовая кожа, фиолетовый худи, жёлтая цепь/эмблема, светло-серый непрозрачный фон; текста нет.
- Тема/a11y: квадратный непрозрачный фон заметен в круглой маске; визуально не связан с Conation и не объясняет роль.
- Происхождение/лицензия: **unknown**, права требуют отдельного подтверждения.

### 8. `apps/web/public/support-avatars/pythia.svg`

- Техника: SVG, 512×512, 1,077 B, alpha: да, статика, SHA-256 `747a50ea243cc8f5e3f87b6a918d9e1d28455b5310bc95696bc30bb499e55e05`.
- Назначение: профиль `pythia@conation.dev`; provisioning script/manifest и self-host docs.
- Вид/OCR: фиолетовый круг с мягким радиальным свечением; белая кириллическая `П`, продолженная дугой как символ портала.
- Тема/a11y: сильный бело-фиолетовый контраст, но буква без имени неоднозначна; у изображения должно быть имя `Pythia`.
- Происхождение/лицензия: **C**; отдельная лицензия не записана.

### 9. `apps/web/public/support-avatars/ramzan-kadyrov.svg`

- Техника: SVG, 512×512, 984 B, alpha: да, статика, SHA-256 `9e183d68faa11266917f161e0e28ae33d746cbdb7a9f3bf960dff47ba9b00c0d`.
- Назначение: профиль `ramzan.kadyrov@conation.dev`; provisioning script/manifest.
- Вид/OCR: тёмно-зелёный круг с двойным кольцом; крупные белые инициалы, визуально читаемые как `PK/РК`, поверх светло-зелёной вертикали и угловатой K-линии.
- Тема/a11y: хороший контраст, но инициалы и использование имени реального человека требуют явного текстового профиля и организационного контроля impersonation.
- Происхождение/лицензия: **C**; пользователь согласовал имя, но права/политика на визуальную identity отдельно не документированы.

### 10. `apps/web/public/support-avatars/tars.svg`

- Техника: SVG, 512×512, 1,097 B, alpha: да, статика, SHA-256 `9eca70ae017c5bbbea452e5bb0e03ec9d11f675745b7ac7a753a716c6abac425`.
- Назначение: профиль `tars@conation.dev`; provisioning script/manifest.
- Вид/OCR: тёмный сине-серый круг с тонкой инженерной сеткой, белая буква T и короткая голубая перекладина/штрих сверху.
- Тема/a11y: белая T читается хорошо; тонкая сетка исчезает при 24–32 px, что допустимо для декоративной детали.
- Происхождение/лицензия: **C**; отдельная лицензия не записана.

### 12. `apps/web/src/components/icon/macro-brand-loader.svg`

- Техника: SVG, 480×480, 2,236 B, alpha: да; SMIL-анимация без дискретных кадров, 2 s loop с задержками 0/0.1/0.2 s; SHA-256 `d7f5ab218235b25e950ca2338763da0bd1869756da4bdd7756fd5a442a1baf77`.
- Назначение: стартовый loader в `lib/core/internal/App.tsx`.
- Вид/OCR: три сегмента Macro-M проходят сверху вниз через вертикальную градиентную маску; в статическом начальном кадре холст может выглядеть пустым.
- Тема/a11y: `currentColor`, но маска содержит чёрно-белый градиент; нужен reduced-motion fallback и доступный `Загрузка…`.
- Происхождение/лицензия: **U**, критическая runtime-поверхность старого бренда.

### 13. `apps/web/src/components/icon/macro-logo-badge.svg`

- Техника: SVG, 24×24, 571 B, alpha: да, статика, SHA-256 `b984e23c7134ba2d39465f22640161aad58e6364f5d084c95fe12e334ef4675f`.
- Назначение: legacy badge; активный import не найден.
- Вид/OCR: чёрный/currentColor Macro-M с круглым вырезом у правого верхнего угла; текста нет.
- Тема/a11y: наследует цвет, пригоден как decorative icon; сам по себе не имеет доступного имени.
- Происхождение/лицензия: **U**, кандидат на удаление после проверки потребителей.

### 14. `apps/web/src/components/icon/macro-logo.svg`

- Техника: SVG, 24×24, 398 B, alpha: да, статика, SHA-256 `c438220dba4ba9dc428fa4e3e2bd5ce9cd153632fd250df3b27e2481f9930e91`.
- Назначение: legacy icon; активный import не найден.
- Вид/OCR: три ломаных вертикальных сегмента, собирающихся в Macro-M; текста нет.
- Тема/a11y: `currentColor` работает в обеих темах; форму нельзя использовать вместо текстового бренда.
- Происхождение/лицензия: **U**, остаток ребрендинга.

### 15. `apps/web/src/components/icon/macro.svg`

- Техника: SVG, 185.06×122.8, 485 B, alpha: да, статика, SHA-256 `ba3dbba65d610d304bf1c1122f4d4be2d396c7808bdb465fb97ba98b50967d41`.
- Назначение: иконка self-knowledge AI tool в `SelfKnowledge.tsx`.
- Вид/OCR: широкий цельный геометрический Macro-M из трёх ступенчатых лент; текста нет.
- Тема/a11y: `currentColor` контрастирует по контексту, но бренд в tool result остаётся старым; нужен Conation mark и текстовая метка инструмента.
- Происхождение/лицензия: **U**.

## 2. Empty states и мобильная установка

Ассеты № 19–32 импортируются из `features/next-soup/soup-view/empty-states.tsx`; дополнительные consumers отмечены отдельно. Это декоративные изометрические иллюстрации, поэтому смысл состояния должен оставаться в заголовке/тексте компонента, а SVG — иметь `aria-hidden`.

### 16. `apps/web/src/lib/design/app-store.svg`

- Техника: SVG, 58×121, 14,892 B, alpha: да, статика, SHA-256 `0a6e7a61de120111a1bae0cf0e27826581e79f1d4770a5f3bb0c6999f25321c7`.
- Назначение: QR-графика в `features/settings/MobileApp.tsx`.
- Вид/OCR: тонкий контур смартфона, внутри чёрно-белый QR-код; текст отсутствует.
- Тема/a11y: маленький QR нельзя делать единственным способом установки — рядом обязательна обычная ссылка и её назначение; тонкий серый контур слаб на тёмном фоне.
- Происхождение/лицензия: **U**; QR destination визуально не подтверждён, связь с App Store следует только из consumer.

### 17. `apps/web/src/lib/design/empty-state-ai.svg`

- Техника: SVG, 38.6×31.32, 2,989 B, alpha: да, статика, SHA-256 `b2f2697b53bce6c62c3de60271cfa726203f9f3b05cd4a3d9dd9ae601a389fc5`.
- Назначение: пустое состояние AI/Agents.
- Вид/OCR: наклонённая прямоугольная карточка/экран над пунктирной изометрической площадкой, рядом несколько орбитальных колец; текста нет.
- Тема/a11y: монохромные тонкие линии, умеренный контраст; декоративно, состояние надо озвучивать текстом.
- Происхождение/лицензия: **U**, отдельная asset-лицензия неизвестна.

### 18. `apps/web/src/lib/design/empty-state-automations.svg`

- Техника: SVG, 24.45×16.34, 7,212 B, alpha: да, статика, SHA-256 `e97c6a4a596ec17e0c03d28d09055bed90f58c97518393b5173f4408f8441508`.
- Назначение: пустое состояние автоматизаций.
- Вид/OCR: цилиндрические часы/таймер на пунктирном пути и три изометрических куба; текста нет.
- Тема/a11y: сложные детали исчезают при нативном малом размере; не использовать как единственное объяснение automation.
- Происхождение/лицензия: **U**.

### 19. `apps/web/src/lib/design/empty-state-calls.svg`

- Техника: SVG, 38.6×34.4, 3,271 B, alpha: да, статика, SHA-256 `3e647e601d0eb451f189379ac3cf59814a61fd96e038a3a9e4bddbfce1294cab`.
- Назначение: пустое состояние звонков.
- Вид/OCR: пунктирная площадка и цепочка падающих/парящих многогранных кристаллов с мелкими кругами; текста нет.
- Тема/a11y: метафора звонка неочевидна, тонкие серые линии требуют текстового заголовка.
- Происхождение/лицензия: **U**.

### 20. `apps/web/src/lib/design/empty-state-channels.svg`

- Техника: SVG, 38.6×27.1, 2,052 B, alpha: да, статика, SHA-256 `da95db8e6cc379da32a8dea7c34aa8bde1106de509ff17fa91fc9c7eb6daaaea`.
- Назначение: пустой список каналов и preview для не-участника (`non-member-channel-preview.tsx`).
- Вид/OCR: две плоские парящие карточки и два круглых элемента над пунктирной площадкой; текста нет.
- Тема/a11y: минимальная line-art читается в обеих темах лишь при корректном CSS-цвете; decorative.
- Происхождение/лицензия: **U**.

### 21. `apps/web/src/lib/design/empty-state-companies.svg`

- Техника: SVG, 38.6×29.45, 2,898 B, alpha: да, статика, SHA-256 `3089a183b195da83e0451bd7bae9eccb72eafd1a76dbdf4370286345814fa70a`.
- Назначение: пустое состояние Companies/CRM.
- Вид/OCR: узкая изометрическая башня с сеткой прямоугольных «окон», рядом круглый маркер; текста нет.
- Тема/a11y: узнаваемость как компании зависит от контекста; обеспечить заголовок и действие создания.
- Происхождение/лицензия: **U**.

### 22. `apps/web/src/lib/design/empty-state-doc.svg`

- Техника: SVG, 38.6×26.67, 1,640 B, alpha: да, статика, SHA-256 `8b801518ed6a8d06672b114b5522433218c9e611fd44a4aa40581f34fcdc1fce`.
- Назначение: пустые документы; также preview-icon в `split-layout/componentRegistry.tsx`.
- Вид/OCR: стопка из трёх смещённых листов на пунктирной платформе; текста нет.
- Тема/a11y: простая метафора, но серые пересекающиеся линии малоконтрастны; decorative.
- Происхождение/лицензия: **U**.

### 23. `apps/web/src/lib/design/empty-state-email.svg`

- Техника: SVG, 38.6×24.77, 2,261 B, alpha: да, статика, SHA-256 `6cc0af9a94db7bf2a7d2b4fde6a9bdd9dbdbadd975665dd2e6ec8cc118b14d66`.
- Назначение: пустое состояние Email.
- Вид/OCR: пять вложенных изогнутых лотков/листов, похожих на стопку входящей почты; текста нет.
- Тема/a11y: смысл понятнее с подписью «Нет писем»; линии низкой насыщенности не должны нести статус.
- Происхождение/лицензия: **U**.

### 24. `apps/web/src/lib/design/empty-state-folder.svg`

- Техника: SVG, 38.6×32.6, 2,076 B, alpha: да, статика, SHA-256 `39cf1cc5cc919af43af030fc04ab0fe96d1ffcadc43b6908ce689abf9eebf8ae`.
- Назначение: пустое состояние папки.
- Вид/OCR: четыре прозрачные вертикальные панели/папки, выстроенные ступенью на пунктирной платформе; текста нет.
- Тема/a11y: перекрывающиеся полупрозрачные контуры могут сливаться; нужен текстовый контекст.
- Происхождение/лицензия: **U**.

### 25. `apps/web/src/lib/design/empty-state-inbox-tray.svg`

- Техника: SVG, 38.6×24.77, 2,109 B, alpha: да, статика, SHA-256 `23c1eba0fb376407974facc67353a406b4f6deaacaa2b9ae9e2a71261c9ce8ed`.
- Назначение: пустой inbox tray.
- Вид/OCR: один толстый изометрический лоток с внутренней светлой плоскостью; текста нет.
- Тема/a11y: форма читается, но не различает «пусто» и «ошибка»; статус должен быть в тексте.
- Происхождение/лицензия: **U**.

### 26. `apps/web/src/lib/design/empty-state-inbox-zero.svg`

- Техника: SVG, 38.7×24.87, 1,079 B, alpha: да, статика, SHA-256 `242ab9a9a6c800e2e320a3b19100dbc543f4cbc1d0213e2df37236ebff0ddab3`.
- Назначение: inbox zero.
- Вид/OCR: почти пустая пунктирная изометрическая площадка без предметов; текста нет.
- Тема/a11y: намеренно минимально, но визуально может восприниматься как не загрузившийся asset; текст `Входящие разобраны` обязателен.
- Происхождение/лицензия: **U**.

### 27. `apps/web/src/lib/design/empty-state-no-access.svg`

- Техника: SVG, 43.27×47.46, 13,124 B, alpha: да, статика, SHA-256 `1efd109a17f3e82e14d2c85e09299e9f893851219d1ad31e21a81ac7193e1105`.
- Назначение: Unauthorized/No access в `AccessErrorViews/Unauthorized.tsx`.
- Вид/OCR: крупный наклонённый круглый сейфовый диск/шестерня с центральным штурвалом и маленьким замком/ромбом рядом; текста нет.
- Тема/a11y: деталей много и они мелкие; сообщение о причине и доступном действии должно быть отдельным текстом.
- Происхождение/лицензия: **U**.

### 28. `apps/web/src/lib/design/empty-state-no-filter-match.svg`

- Техника: SVG, 49.65×31.18, 1,956 B, alpha: да, статика, SHA-256 `9ef584e7d8257698d471f3b6007912487393272b447f024c5af1f9896cf97278`.
- Назначение: фильтр не дал совпадений.
- Вид/OCR: несколько параллельных округлых полос, сходящихся в короткий стек; текста нет.
- Тема/a11y: абстрактная метафора фильтра, состояние и сброс фильтров должны быть клавиатурно доступным текстом.
- Происхождение/лицензия: **U**.

### 29. `apps/web/src/lib/design/empty-state-no-search-match.svg`

- Техника: SVG, 32.25×21.06, 2,360 B, alpha: да, статика, SHA-256 `2f47acea34551e6be9584f1c767090f900151c598247bc3bcc86a8766c4d506a`.
- Назначение: поиск без результатов.
- Вид/OCR: контурный открытый короб/конверт на пунктирной площадке; текста нет.
- Тема/a11y: иконка не похожа на лупу, поэтому без подписи неоднозначна; decorative.
- Происхождение/лицензия: **U**.

### 30. `apps/web/src/lib/design/empty-state-tasks.svg`

- Техника: SVG, 38.6×28.25, 3,790 B, alpha: да, статика, SHA-256 `529adedfea3ab5fb129d103f2398590faeb470dc713bc61008d998c228cf2f68`.
- Назначение: пустое состояние Tasks.
- Вид/OCR: три изометрических куба разных размеров; у высокого блока сверху овальная выемка/метка; текста нет.
- Тема/a11y: связь с задачами абстрактна; текст и CTA обязательны.
- Происхождение/лицензия: **U**.

## 3. AI- и MCP-интеграции

Все знаки № 33–42 монохромны, используют прозрачный холст и должны сопровождаться текстовым названием сервиса. Внешний знак не означает, что интеграция настроена или одобрена владельцем бренда.

### 31. `apps/web/src/lib/core/component/AI/assets/anthropic.svg`

- Техника: SVG, 92.2×65, 252 B, alpha: да, статика, SHA-256 `869b21e5493346edefbb51c8143a1bf08388c6f1d5c93a5505cff6a6b8ca2533`.
- Назначение: model catalog в `AI/constant/model.ts`.
- Вид/OCR: массивная чёрная стилизованная буква A с треугольным просветом и диагональным правым штрихом; текста кроме формы буквы нет.
- Тема/a11y: исходная чёрная заливка плохо видна на тёмной теме, если CSS не перекрашивает SVG.
- Происхождение/лицензия: **T**, Anthropic trademark; bundled license неизвестна.

### 32. `apps/web/src/lib/core/component/AI/assets/openai.svg`

- Техника: SVG, 24×24, 1,357 B, alpha: да, статика, SHA-256 `739f19e0287ef80e16576c82597f05969921f15e35e6a8dd923a70833d134db2`.
- Назначение: model catalog в `AI/constant/model.ts`.
- Вид/OCR: шестилопастный переплетённый узел OpenAI; текста нет.
- Тема/a11y: чёрный/currentColor должен явно переключаться для dark mode; название модели нельзя заменять одной иконкой.
- Происхождение/лицензия: **T**, OpenAI trademark; bundled license неизвестна.

### 33. `apps/web/src/components/icon/mcp-datadog.svg`

- Техника: SVG, 24×24, 3,018 B, alpha: да, статика, SHA-256 `6ae711b558d67bc4026ac572a21d518bdab9d9dbc8facaeebaa9b804f6bbea50`.
- Назначение: MCP server catalog в `constant/mcpServers.ts`.
- Вид/OCR: голова белой/чёрной собаки рядом с карточкой-графиком; текста нет.
- Тема/a11y: двухтонные детали могут исчезать после forced-color; подпись `Datadog` обязательна.
- Происхождение/лицензия: **T**, Datadog trademark.

### 34. `apps/web/src/components/icon/mcp-github.svg`

- Техника: SVG, 24×24, 842 B, alpha: да, статика, SHA-256 `5e2d81ef6b15846ab74e2ef09d270d98e6d6cd0caf16d7016b56b514de96352d`.
- Назначение: MCP catalog, mobile onboarding и GitHub/Team settings, PR/entity/notification UI.
- Вид/OCR: силуэт Octocat в чёрном круге; текста нет.
- Тема/a11y: хорошо узнаваем, но на тёмном фоне требуется инверсия/контраст; controls должны называться `GitHub`.
- Происхождение/лицензия: **T**, GitHub trademark/logo policy.

### 35. `apps/web/src/components/icon/mcp-gmail.svg`

- Техника: SVG, 24×24, 359 B, alpha: да, статика, SHA-256 `e3da6558f981cd439119312235fb324bf8f9d83c719770b9b870690269e722e4`.
- Назначение: Email settings, setup `EmailStep` и `SummaryStep`.
- Вид/OCR: толстая угловатая буква M/контур конверта; в этом монохромном варианте фирменные цвета Gmail отсутствуют.
- Тема/a11y: `currentColor` адаптируется, но символ похож на старый Macro-M; всегда показывать подпись `Gmail`.
- Происхождение/лицензия: **T**, Google/Gmail trademark.

### 36. `apps/web/src/components/icon/mcp-grafana.svg`

- Техника: SVG, 24×24, 3,837 B, alpha: да, статика, SHA-256 `13c06adcab82ea71538523e7995266ef013fc1b7bde311c14080fbafd98b114d`.
- Назначение: MCP server catalog.
- Вид/OCR: зубчатое солнце/спираль Grafana с толстым внутренним завитком; текста нет.
- Тема/a11y: мелкие зубцы теряются при 16 px; подпись обязательна.
- Происхождение/лицензия: **T**, Grafana trademark.

### 37. `apps/web/src/components/icon/mcp-linear.svg`

- Техника: SVG, 24×24, 473 B, alpha: да, статика, SHA-256 `c7452cabc2b8c0d7677589c52ed65c1daf39670dace1a88c7e43697d0c17ac25`.
- Назначение: MCP server catalog.
- Вид/OCR: чёрный круг с тремя диагональными белыми прорезями снизу слева; текста нет.
- Тема/a11y: геометрия читается, но инверсия обязательна на dark theme; подпись `Linear`.
- Происхождение/лицензия: **T**, Linear trademark.

### 38. `apps/web/src/components/icon/mcp-notion.svg`

- Техника: SVG, 24×24, 998 B, alpha: да, статика, SHA-256 `22263b5da8096e160723dc18109e990d61ca5268fdfc92619c2bc42d6ac7f23b`.
- Назначение: MCP server catalog.
- Вид/OCR: объёмная контурная страница/куб с засечной буквой `N`.
- Тема/a11y: тонкая внешняя линия может теряться на тёмном; текстовое имя обязательно.
- Происхождение/лицензия: **T**, Notion trademark.

### 39. `apps/web/src/components/icon/mcp-posthog.svg`

- Техника: SVG, 24×24, 1,016 B, alpha: да, статика, SHA-256 `d7a0668260d3d8d8e5efa076ab117fb36fab91bb36700e37ab5889bd0a7281a1`.
- Назначение: MCP server catalog.
- Вид/OCR: угловатый силуэт ежа/кабана с диагональными «иглами» и круглым глазом; текста нет.
- Тема/a11y: в малом размере силуэт сливается; подпись `PostHog` обязательна.
- Происхождение/лицензия: **T**, PostHog trademark.

### 40. `apps/web/src/components/icon/mcp-slack.svg`

- Техника: SVG, 24×24, 1,125 B, alpha: да, статика, SHA-256 `3917be4ac4298b44c625d856b844b43454b9df88edc0ff52d087f92f935e729b`.
- Назначение: MCP server catalog.
- Вид/OCR: монохромная решётка Slack из четырёх округлых полос и четырёх коротких капсул; текста нет.
- Тема/a11y: без фирменных цветов менее узнаваем; подпись `Slack` и подходящий контраст обязательны.
- Происхождение/лицензия: **T**, Slack trademark.

## 4. Изображения production-документации

Все скриншоты ниже отображаются из `apps/docs/*.mdx`. Почти все сняты в dark theme, содержат английский UI, старый оранжевый Macro mark и/или реальные имена. Для русского white-label релиза их нельзя оставлять «как есть»: нужен новый скриншот Conation с тестовыми данными и русским alt-текстом.

### 41. `apps/docs/images/Macro-Big-QR.png`

- Техника: PNG, 216×216, 3,540 B, alpha: да, 1 кадр, SHA-256 `c345f128f543b1e1489f7400e7147d25678632afc38f4b88f3f4dffa5f52983e`.
- Назначение: раздел `apps/docs/apps.mdx`, iOS download.
- Вид/OCR: квадратный чёрно-белый QR-код с тремя крупными угловыми маркерами; обычного текста нет. Сам payload в этом аудите не декодирован; consumer утверждает, что это App Store.
- Тема/a11y: вокруг кода достаточно quiet zone, но обязательна обычная кликабельная ссылка с названием приложения и destination.
- Происхождение/лицензия: **U**; destination и актуальность App Store listing надо проверить перед релизом.

### 42. `apps/docs/images/Macro_Snippets.gif`

- Техника: GIF, 1280×720, 5,212,056 B, alpha: да, 66 кадров, 4,390 ms, бесконечный loop, SHA-256 `88a463b99a93c3c860a2e7a5cf48cebd126cc19491cbbdaf4c8306732896935c`.
- Назначение: hero-демо в `apps/docs/product/snippets.mdx`.
- Вид/OCR: тёмный composer письма на розово-бирюзовом desktop wallpaper. Видны `Jacob Beckerman <jacob@macro.com>`, `Macro users or email addresses`, `Subject`, `Use @ to reference files`; меню `Snippets` с `Calendar link` и `Platy's snippet`; после выбора появляется красная ссылка `https://cal.com/jacob-beckerman-b5bmin/30min`.
- Тема/a11y: мелкий серый текст, быстрое движение и бесконечный loop; нужны reduced-motion/static fallback, русская подпись и обновлённые тестовые identity/domain. GIF раскрывает персональный calendar URL.
- Происхождение/лицензия: **S**; wallpaper/profiles/calendar service могут иметь отдельные права, неизвестно.

Покадровая проверка GIF (кадры перечислены все; внутри группы меняется только позиция курсора/сжатие, если отдельное изменение UI не указано):

| Кадры и длительность | Состояние/изменение |
| --- | --- |
| F01 70 ms; F02 60; F03 70; F04 70; F05 60; F06 70; F07 70; F08 60 | Composer открыт; подсказка `Use @ to reference files`; курсор движется к строке ввода. |
| F09 70; F10 70; F11 60; F12 70; F13 70; F14 60; F15 70; F16 70 | Та же форма и текст; курсор продолжает движение, новых элементов нет. |
| F17 60; F18 70; F19 70; F20 60; F21 70; F22 70; F23 60; F24 70 | Фокус/каретка появляется в body; начинается вызов snippet-menu, но меню ещё не показано. |
| F25 70; F26 60; F27 70; F28 70; F29 60; F30 70 | Открывается popover `Snippets`; видны `Calendar link` и `Platy's snippet`, верхняя строка подсвечена. |
| F31 70; F32 60; F33 70; F34 70; F35 60; F36 70 | Popover остаётся; курсор/hover смещается внутри списка, семантический набор опций не меняется. |
| F37 70; F38 60; F39 70 | Popover закрывается после выбора; короткое промежуточное пустое состояние body. |
| F40 70; F41 60; F42 70; F43 70; F44 60; F45 70 | В body вставлена красная подчёркнутая ссылка `https://cal.com/jacob-beckerman-b5bmin/30min`; курсор отходит вниз. |
| F46 70; F47 60; F48 70; F49 70; F50 60; F51 70 | Ссылка и весь composer неизменны; меняется только позиция курсора/микрокадр записи. |
| F52 70; F53 60; F54 70; F55 70; F56 60; F57 70 | То же финальное состояние со ссылкой; никаких новых controls или текста. |
| F58 70; F59 60; F60 70; F61 70; F62 60; F63 70; F64 70; F65 60; F66 60 | Финальная выдержка; ссылка остаётся, затем GIF зацикливается на F01. |

### 43. `apps/docs/images/agents_screenshot-1.png`

- Техника: PNG, 3948×2160, 1,170,204 B, alpha: да, 1 кадр, SHA-256 `7c4bc983221170cceaf42381d23daae6fb9283750b61c535c69822315cc0e14a`.
- Назначение: `apps/docs/product/agents.mdx`, обзор Agents.
- Вид/OCR: полноэкранный тёмный UI: слева Create/Inbox/Search/Agents/Email/Documents/Tasks/Channels/Calls/Folders; сверху `Agents`, вкладки `Owned`, `Running`, `Shared`, `Automations`; список бесед, включая `i was sick the end of last week, catch me up`, `New Chat`, `translate to english`.
- Тема/a11y: на 3948 px читаемо, при вставке в docs мелкий серый текст становится недоступным; нужен лаконичный русский alt, не OCR всего экрана.
- Происхождение/лицензия: **S**; содержит реальные рабочие запросы/данные — требуется scrub.

### 44. `apps/docs/images/betterFilter.png`

- Техника: PNG, 1312×2160, 347,568 B, alpha: да, 1 кадр, SHA-256 `3db91fa84694e0524310a0cc38c188923689fee06a942ce4f34537634bbde485`.
- Назначение: `apps/docs/product/search.mdx`, пример фильтра.
- Вид/OCR: узкий тёмный popover со списком `Channels`, `Documents`, `Tasks`, `Email`, `Calls`, `Folders`, `Agents`, `All`; слева пиктограммы, справа chevrons; `All` выделен оранжевым check.
- Тема/a11y: контраст приемлем, но selected state передан цветом и значком; русская версия должна сохранять check и visible focus.
- Происхождение/лицензия: **S**.

### 45. `apps/docs/images/calls_off_switch.png`

- Техника: PNG, 3728×2160, 389,185 B, alpha: да, 1 кадр, SHA-256 `2fa2d6e83e8deeadc52217a554222d6ef4ce49d71d5b151bc508fa2178087396`.
- Назначение: `apps/docs/product/calls.mdx`, настройка share-to-team.
- Вид/OCR: крупный crop тёмной панели; метка `You` и строка `Share with team` с оранжевым отмеченным checkbox.
- Тема/a11y: checkbox и подпись читаемы, но screenshot не сообщает состояние focus/keyboard; русская версия должна показать реальный control, не полагаться на цвет.
- Происхождение/лицензия: **S**.

### 46. `apps/docs/images/calls_screenshot.png`

- Техника: PNG, 3948×2160, 970,469 B, alpha: да, 1 кадр, SHA-256 `eddcc79cc3845b09bdab820ffd150b62c07e2fe24873f3e65eda6a55215bda19`.
- Назначение: `apps/docs/product/calls.mdx`, список звонков.
- Вид/OCR: полный dark UI Calls со списком записей `Austin Barrón`, `Evan's CRM v0 & Hutch's GitHub Team Updates`, `bug-reports`, `Weekly Standup…`; видны длительности и статусы.
- Тема/a11y: строки и timestamps слишком мелки для обычной ширины docs; нужен увеличиваемый screenshot и краткий alt.
- Происхождение/лицензия: **S**; реальные имена/названия встреч надо обезличить.

### 47. `apps/docs/images/channel-sharing-diagram.svg`

- Техника: SVG, 760×400, 3,680 B, alpha: да, статика, SHA-256 `38735f33d2a2c9ddd5c9c719a2f6a7be67301c714063aaf385dad9267fc74573`.
- Назначение: `apps/docs/permissions.mdx`.
- Вид/OCR: слева карточка канала `#design` с участниками и упоминанием `Spec v2`; оранжевая стрелка `auto-shared` ведёт к карточке документа `Spec v2`, рядом подписи про доступ; внизу персонажи Dana и Ben с англоязычными пояснениями.
- Тема/a11y: логика зависит от стрелки и мелкого текста; требуется русская текстовая эквивалентная последовательность вне SVG.
- Происхождение/лицензия: **U**; product diagram, отдельная лицензия неизвестна.

### 48. `apps/docs/images/channels_screenshot.png`

- Техника: PNG, 3948×2160, 1,200,317 B, alpha: да, 1 кадр, SHA-256 `860206a17e71a5754478f360465a2fbb5be87bea4fc9b30753d29237ca8f100c`.
- Назначение: `apps/docs/product/channels.mdx`.
- Вид/OCR: Channels в dark UI; вкладки `Recent`, `People`, `Teams`; строки `pr-requests`, `random`, `bug-reports`, `Engineers`, `Macro`, пользователи Gabriel/Jacob/Teo/Julia и snippets сообщений.
- Тема/a11y: мелкий список, оранжевые highlights и реальные имена; для локализации нужен новый демонстрационный workspace.
- Происхождение/лицензия: **S**.

### 49. `apps/docs/images/create_tags.png`

- Техника: PNG, 720×660, 60,058 B, alpha: да, 1 кадр, SHA-256 `e412afb9fb774467b84e6349a47b6a0a2eb35acd697f7bcaf3d6d10f783fa698`.
- Назначение: `apps/docs/product/tagging.mdx`, inline tag creation.
- Вид/OCR: popover `Tags`, `+ Add tags`, query `m`; цветные tags `roadmap`, `md`, `markdown`, `seamus-plis…`, `features/tea…`, `crm`; строка `Create new tag "m"`; рядом в owner-колонке несколько `Macro`.
- Тема/a11y: цветные точки дополнены текстом, что хорошо; требуется русский UI и очистка старого owner-brand.
- Происхождение/лицензия: **S**.

### 50. `apps/docs/images/crm_better.png`

- Техника: PNG, 2550×1520, 338,349 B, alpha: да, 1 кадр, SHA-256 `c3aeab3fd2d66d4256e3808489e40efaab52a56027091c3ee79eeca6e9fcb42c`.
- Назначение: `apps/docs/product/crm.mdx`, board view.
- Вид/OCR: Kanban CRM в dark theme, колонки `Lead`, `Done`, `Customer`, `Churned`; карточки компаний с доменами, суммами и датами.
- Тема/a11y: статусы различаются заголовком и цветной точкой; при уменьшении домены/суммы нечитаемы, нужен zoom и alt.
- Происхождение/лицензия: **S**; домены и клиентские данные надо заменить фиктивными.

### 51. `apps/docs/images/crm_emails.png`

- Техника: PNG, 1434×928, 138,825 B, alpha: да, 1 кадр, SHA-256 `44ca42a8ca2a592bbb28947a901205db335158d616230089b2f5658a9b61e47b`.
- Назначение: `apps/docs/product/crm.mdx`, CRM рядом с email.
- Вид/OCR: CRM record `Open Source Alternatives to Paid Software`, описание GitHub/open-source; блок `Discussion` с `Leave a comment…`; список `Emails`, фильтры `Signal`, `All`, `Team`, `Me`, темы `Re: Sponsorship inquiry`, `Email Thread`.
- Тема/a11y: очень плотный текст; в русской версии лучше разделить на два crop или дать полноразмерный просмотр.
- Происхождение/лицензия: **S**; присутствует GitHub mention/trademark.

### 52. `apps/docs/images/email_signal_ss-2.png`

- Техника: PNG, 3948×2160, 1,180,410 B, alpha: да, 1 кадр, SHA-256 `54d7ac30d565c99982b5c5c4b978d2a6a4bbbf5520cc1b7f98773b0d02a64f5a`.
- Назначение: `apps/docs/product/email.mdx`, Signal inbox. Две byte-identical копии `email_signal_ss.png` и `email_signal_ss-1.png` сознательно не считаются отдельным покрытием.
- Вид/OCR: Email → `Signal`, список писем `Customer Suppo…`, `Tammay Thaker`, `Megan Flood`, `Northeastern…`; темы `Re: Sawyer Twain - Order…`, `Accepted: macro x idea`, `Re: Julia - pipeline thought`.
- Тема/a11y: dark screenshot с мелкими серыми previews; нужен русский тестовый inbox и удаление реальных имён/тем.
- Происхождение/лицензия: **S**.

### 53. `apps/docs/images/example_automation.png`

- Техника: PNG, 1447×1113, 105,947 B, alpha: да, 1 кадр, SHA-256 `f6eb608061cafdadf3d3a03e2c1cadb3416774b1dc6accdcf1936a892373224a`.
- Назначение: `apps/docs/product/agents.mdx`, создание automation.
- Вид/OCR: modal `New Automation`; `Name: To do this summary`; инструкции; `Schedule`, `Every day`, дни Sun–Sat, `9:00 AM`; кнопки `Cancel`, `Create`.
- Тема/a11y: selected days отмечены оранжевым, но есть текст; screenshot нужно перевести и проверить contrast disabled/unselected states.
- Происхождение/лицензия: **S**.

### 54. `apps/docs/images/github-task-pr.png`

- Техника: PNG, 1486×640, 90,189 B, alpha: да, 1 кадр, SHA-256 `d1c0b39f86c6d8ae0d2bb9f11ab5fc7168c6e198258a61b447ea42078abcbc23`.
- Назначение: `apps/docs/integrations/github.mdx`.
- Вид/OCR: task `Sort order possibly being inherited between views when switching`; badges `Completed`, `Medium`, `Rahul`; связанный PR `fix(soup): sort being shared across views macro-inc/macro#3855`.
- Тема/a11y: GitHub relationship показан мелкой строкой/иконкой; новый screenshot должен использовать Conation repo и фиктивный issue.
- Происхождение/лицензия: **S** + GitHub trademark.

### 55. `apps/docs/images/inbox_full.png`

- Техника: PNG, 2960×1792, 445,360 B, alpha: да, 1 кадр, SHA-256 `ea1840cfa691758b98b3facba9fdd588d0e98bbb76d43b03104d7c29d92be2ca`.
- Назначение: `apps/docs/product/inbox.mdx`, заполненный inbox.
- Вид/OCR: широкий dark inbox, сгруппированный по командам/секциям; множество строк задач/писем, assignees, статусов и timestamps; верхний search/filter bar.
- Тема/a11y: слишком высокая информационная плотность для статичного alt; нужен zoom и краткое описание структуры, данные следует обезличить.
- Происхождение/лицензия: **S**.

### 56. `apps/docs/images/model_options.png`

- Техника: PNG, 1426×422, 60,235 B, alpha: да, 1 кадр, SHA-256 `d8883dad63875d7fe899b7210b849409af3ccc8e97fe0a7f2789e233883df3f9`.
- Назначение: `apps/docs/product/agents.mdx`, model picker.
- Вид/OCR: AI composer `Ask AI, @mention anything`; открытый список моделей `Sonnet 5`, `Opus 4.5`, `Haiku 4.5`, `Sonnet 4.5`, `GPT-5.5`, `GPT-5 mini`.
- Тема/a11y: список мелкий, выделение неочевидно; главное — данные устаревающие и не соответствуют заявленному OmniRoute default/fallback, screenshot надо переснять.
- Происхождение/лицензия: **S**; model names — сторонние marks.

### 57. `apps/docs/images/new_channel_ui.png`

- Техника: PNG, 1620×524, 57,660 B, alpha: да, 1 кадр, SHA-256 `78ed65f06da9fb513d2d96acca9e6b658c1978712cc12178ab7537f23c304db0`.
- Назначение: `apps/docs/product/channels.mdx`, создание канала.
- Вид/OCR: тёмный modal с `# Channel name`, `Invite people (Optional)`, placeholder `To: Macro users or email addresses`, disabled `Create Channel`, close X.
- Тема/a11y: placeholder не заменяет label; русский screenshot должен показать Conation wording и visible focus/error states.
- Происхождение/лицензия: **S**, явный Macro copy debt.

### 58. `apps/docs/images/search_screenshot-1.png`

- Техника: PNG, 3948×2160, 1,162,941 B, alpha: да, 1 кадр, SHA-256 `4418951067a66aa8ed7685d8baa0c1b220c82d3abe1edc19e60be41116e1611d`.
- Назначение: `apps/docs/product/search.mdx`.
- Вид/OCR: full Search UI; поле `Search, @mention contacts`, кнопка `Filter`; результаты `pr-requests`, `DOCS' Master doc`, `random`, `bug-reports`, `email signal returns result…`, `Milled`, `Multibagger Ideas`.
- Тема/a11y: множество типов различаются маленькими иконками; нужен русский alt, который объясняет смешанный поиск, и scrub данных.
- Происхождение/лицензия: **S**.

### 59. `apps/docs/images/snippets_create_menu.png`

- Техника: PNG, 1116×490, 72,456 B, alpha: да, 1 кадр, SHA-256 `403b1ced506cae4f192975f2239141c27ead740fa1e1ff499dde25bc722ac744`.
- Назначение: `apps/docs/product/snippets.mdx`, Create New launcher.
- Вид/OCR: четыре карточки `Doc`, `Task`, `Snippet`, `Email` под заголовком `Create New`; snippet имеет розовую `{=}`-подобную пиктограмму и стрелку.
- Тема/a11y: keyboard hints и labels видны, но текст английский; цвет snippet дополнен именем.
- Происхождение/лицензия: **S**.

### 60. `apps/docs/images/snippets_team_share.webp`

- Техника: WebP, 2000×734, 26,488 B, alpha: нет, 1 кадр, SHA-256 `d6f78f07d15f956feec615393d3889b4f158c29ad64f0cd6b548d12203084d5a`.
- Назначение: `apps/docs/product/snippets.mdx`, team sharing.
- Вид/OCR: панель `Sharing`; checkbox `Share with team`; пояснение `Lets everyone on your team insert this snippet from the ; menu and edit it.`
- Тема/a11y: английская фраза содержит грамматически спорное `Lets`; checkbox unchecked виден слабо, нужен перевод и корректный apostrophe/описание keyboard trigger.
- Происхождение/лицензия: **S**.

### 61. `apps/docs/images/task_create2.png`

- Техника: PNG, 1440×816, 100,304 B, alpha: да, 1 кадр, SHA-256 `dd927ed437e3b1a000240c3c6e7d2c84f23341818fa7018bdf829364e9480ee6`.
- Назначение: `apps/docs/product/tasks.mdx`, создание задачи.
- Вид/OCR: task composer `linear mcp is still failing to connect`, context `# bug-reports Message`; properties `Not Started`, `Urgent`, `Eric`, date `Jul 27, 2026`, tag `bug`; `Similar Tasks`; кнопка `Create Task`.
- Тема/a11y: статусы имеют цвет и текст, что хорошо; реальные имена/данные и английский UI надо заменить.
- Происхождение/лицензия: **S**, Linear mark/name.

### 62. `apps/docs/images/tasks_shared.png`

- Техника: PNG, 2576×1520, 431,631 B, alpha: да, 1 кадр, SHA-256 `95e67df158c149fc66125bc6074c7158ef58018b3b6a55f0d3a2d7fcd6fb60a4`.
- Назначение: `apps/docs/product/tasks.mdx`, shared tasks.
- Вид/OCR: большая таблица Tasks, группы `Gabriel B…` и другие; колонки `Status`, `Priority`, `Assignee`, `Created By`, `Updated`; многочисленные green/orange status icons.
- Тема/a11y: таблица слишком мелкая и цветонасыщенная для docs; alt должен объяснять grouping/columns, а не перечислять строки.
- Происхождение/лицензия: **S**, рабочие данные требуют scrub.

### 63. `apps/docs/images/unified-memory-diagram.svg`

- Техника: SVG, 760×470, 3,867 B, alpha: да, статика, SHA-256 `e818459460893a1355903764ed378ae7411c1015c4c7d556ada9b38d34a3290d`.
- Назначение: `apps/docs/product/unified-memory.mdx`.
- Вид/OCR: центральный оранжевый блок `Unified memory / one database / personal + team`; слева `Email`, `Messages`, `Tasks`, `Docs`, справа `Calls`, `Files`, `Canvas`, `Pull requests`; снизу `Agents / chats · @Macro · automations`.
- Тема/a11y: связи показаны тонкими линиями, а смысл зависит от English labels; нужен русский текстовый список и замена `@Macro` на каноническое identity Conation.
- Происхождение/лицензия: **U**, product diagram.

### 64. `apps/docs/images/Screenshot-2026-06-02-at-6.40.28-PM.png`

- Техника: PNG, 698×316, 25,973 B, alpha: да, 1 кадр, SHA-256 `78ae7763dde2f4a075520a27ad14bbff03e301e364cc9cb64514793286dd8eea`.
- Назначение: `apps/docs/product/docs.mdx`, пример comment/mention.
- Вид/OCR: карточка комментария Austin Barrón, время `11:38 AM`, оранжевое упоминание `@julia`, поле `Reply…`.
- Тема/a11y: хороший крупный crop, но имя/аватар реального человека и английский placeholder требуют замены; mention не должен отличаться только оранжевым.
- Происхождение/лицензия: **S**.

### 65. `apps/docs/images/Screenshot-2026-06-03-at-11.52.56-AM.png`

- Техника: PNG, 1296×322, 66,737 B, alpha: да, 1 кадр, SHA-256 `2c83e34288126448f15478f601d8959cbbd823e6296c35bcfffabb700c5ff4a0`.
- Назначение: `apps/docs/product/email.mdx`, shared email in channel.
- Вид/OCR: header канала `# Macro`, tabs `Messages`, `Attachments`, `Participants`, кнопка `Call`; сообщение `jacob Beckerman`, `???` и вложенная email-card `Re: Macro feat req / enterprise deployment`.
- Тема/a11y: старый brand встречается дважды, текст очень мелкий; переснять с Conation test channel и русскими labels.
- Происхождение/лицензия: **S**; имя/фото требуют scrub.

### 66. `apps/docs/images/Screenshot-2026-06-03-at-4.54.24-PM.png`

- Техника: PNG, 1642×390, 105,168 B, alpha: да, 1 кадр, SHA-256 `3da4efbfc1827984a184712ce5e92384f05f58304c00707a2e84fff646b4b798`.
- Назначение: `apps/docs/product/channels.mdx`, assistant inside channel.
- Вид/OCR: Jacob Beckerman пишет `@Macro list all team ooo's next 30 days pls`; ниже `Macro` с badge `Agent` отвечает `Here's what I've got for June 3–July 3, 2026…` и перечисляет отпуска Sean/Seamus.
- Тема/a11y: явное старое canonical handle, английский assistant copy и персональные HR-данные; asset требует полной замены, а не косметического crop.
- Происхождение/лицензия: **S**, потенциально чувствительные данные.

### 67. `apps/docs/images/Screenshot-2026-06-03-at-5.01.06-PM.png`

- Техника: PNG, 1292×1054, 218,344 B, alpha: да, 1 кадр, SHA-256 `1ff0efea822646e1d835b4b504f815b4936286a6509a6b8a4a17a24289c4ade2`.
- Назначение: `apps/docs/product/agents.mdx`, agent answer with workspace context.
- Вид/OCR: документ/agent view `priorities`; вопрос `What are my top priorities today?`; нумерованный ответ со ссылками `bug-reports`, `Engineers`, `jackson`, `julia`, `austin` и датой `Fri, Apr 24, 2026`.
- Тема/a11y: длинный English answer в узком screenshot не читается без zoom; нужны русские синтетические данные и alt о результате, а не полный transcript.
- Происхождение/лицензия: **S**.

### 68. `apps/docs/images/Screenshot-2026-06-09-at-11.33.57-AM.png`

- Техника: PNG, 3456×2216, 687,842 B, alpha: да, 1 кадр, SHA-256 `5b9c6b28752ca7a005b8742ced6233ca4a252cb9c091f8cf5c471d22c6d51bdc`.
- Назначение: hero на `apps/docs/index.mdx`.
- Вид/OCR: полноэкранный dark Inbox с оранжевым Macro mark, левым sidebar и группами `William Paynter`, `Peter Sturdivant`, `Summarize what the team has been working on…`, `Problems with macro onboarding`, `Docs todos`; внизу AI composer.
- Тема/a11y: как главная иллюстрация наиболее заметно транслирует старый бренд и английский UI; мелкий текст и реальные имена недоступны/небезопасны. Замена обязательна.
- Происхождение/лицензия: **S**.

### 69. `apps/docs/images/Screenshot-2026-06-09-at-3.59.21-PM.png`

- Техника: PNG, 1700×718, 99,726 B, alpha: да, 1 кадр, SHA-256 `ea3fddec9c1ba7e3198427eedadbd1a7e6288ff8fca1fa63100088764c9ea5d4`.
- Назначение: `apps/docs/concepts/mentions.mdx`, references in agent prompt.
- Вид/OCR: приветствие `Good afternoon, Jacob`; prompt `Can you please read through bug-reports and Engineers to see if we're making progress on our Roadmap for next 8 months.`; ниже chips трёх references и оранжевая send-button.
- Тема/a11y: references имеют иконки и текст, что хорошо; всё содержимое и identity необходимо русифицировать/обезличить.
- Происхождение/лицензия: **S**.

### 70. `apps/docs/images/Screenshot-2026-06-09-at-3.59.41-PM.png`

- Техника: PNG, 1496×734, 194,200 B, alpha: да, 1 кадр, SHA-256 `3565835cb4d09e2ebf18106cb04609f02e8f2f6f7ecf32ec8d543b3b44867aef`.
- Назначение: `apps/docs/concepts/mentions.mdx`, embedded task in channel.
- Вид/OCR: channel thread с Rahul/Eric Hutch; task-card `Notification stacks showing for emails`, status `Completed`, badge `2 people`, время `12:32 PM`; ниже сообщения `weird, will investigate`.
- Тема/a11y: карточка хорошо отделена border, status содержит текст и icon; реальные имена и английский разговор требуют synthetic replacement.
- Происхождение/лицензия: **S**.

### 71. `apps/docs/images/Screenshot-2026-06-09-at-4.00.02-PM.png`

- Техника: PNG, 750×1318, 205,538 B, alpha: да, 1 кадр, SHA-256 `e4836e43fda8b75bdc599a185e5322af4fda8dbb1eaa7d750da916d9bc524a8a`.
- Назначение: `apps/docs/concepts/mentions.mdx`, references/history panel.
- Вид/OCR: высокая узкая панель `References (10)` со списком карточек: `Macro Open Source Announcement and Roadmap`, `Your startup needs an operating system`, `Making the Mobile Experience good by March 1 2026`, `New Canvas` и др.; видны Jacob/Teo и даты.
- Тема/a11y: вертикальный screenshot содержит очень мелкий текст; для docs лучше интерактивный zoom или crop. `Macro`/identity/date fixtures надо заменить.
- Происхождение/лицензия: **S**.

### 72. `apps/docs/images/Screenshot-2026-06-09-at-4.00.50-PM.png`

- Техника: PNG, 1160×582, 80,070 B, alpha: да, 1 кадр, SHA-256 `1bc2ac90daf4cdbbf3f597d78ce888580e1b76aa14b3cb74a1723a84594b43f3`.
- Назначение: `apps/docs/concepts/mentions.mdx`, person mention in email.
- Вид/OCR: email composer `from jacob Beckerman <jacob@macro.com>`, получатель Austin Barrón, subject `Latest Video Deliverable`, body `Hey Austin, @teo`; people popover `Teo Nys | teo@macro.com`.
- Тема/a11y: критический white-label debt — старые домен, identity и персональные данные; mention highlight должен иметь semantic markup, не только серую плашку.
- Происхождение/лицензия: **S**; заменить полностью.

### 73. `apps/docs/images/Screenshot-2026-06-09-at-4.02.53-PM.png`

- Техника: PNG, 1504×154, 46,760 B, alpha: да, 1 кадр, SHA-256 `9294e0ed5f312ae5d522efe79234f6f0035ffc63d55eecdc794da213486f7ab8`.
- Назначение: `apps/docs/concepts/mentions.mdx`, inline referenced document/date.
- Вид/OCR: одна строка на тёмном фоне: `The RRFD 1 yr roadmap written Fri, Sep 5, 2025 is still correct though not descriptive enough. This is one level down from that high level roadmap.`; document chip фиолетовый, date chip оранжевый.
- Тема/a11y: контраст текста хороший, chips различаются не только цветом, но icon/формой; всё равно нужен русский screenshot и объясняющий alt.
- Происхождение/лицензия: **S**.

## Итоги batch 1 и действия

- **Replace required:** № 1–3 — подтверждённые старые glyphs документации (это не accepted Conation assets); № 5–7, 11–15 и 41–73 — старый Macro brand, неизвестные avatars либо англоязычные/персонализированные docs surfaces. Их SHA фиксируют состояние до замены.
- **Keep candidate после проверки:** № 10–12 и 19–32. Для support avatars нужна запись о правообладателе; empty-state art можно сохранить, если доступные подписи и контраст подтверждены.
- **Third-party rights review:** № 18 и 33–42. Наличие файла не означает право использовать знак или готовность интеграции.
- **Machine-only remainder:** текущий canonical snapshot содержит 297 asset-row; после интеграции Conation masters и новых derivatives текущий `ASSET_MACHINE_INDEX.tsv` содержит 312 строк. Этот batch покрывает ровно 73 canonical production-ассета; ещё 239 текущих путей не входят в batch 1. Основные категории следующей партии: остальные product-doc screenshots/diagrams/WebP, функциональные UI icons, затем platform-generated app icons. Test snapshots и byte-identical derivatives следует учитывать отдельно, а не выдавать за новое визуальное покрытие.
- Три user-supplied masters сверху и две активные docs-копии визуально проверены отдельно от 73-строчного baseline; их точные SHA и active-use mapping зафиксированы выше. Машинный индекс после замены пересобран.
