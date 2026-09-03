# Генерируемый kickstart

Этот каталог намеренно не содержит `kickstart.json`. Его создаёт только
`cargo x stack up` в `infra/local/generated/<instance>/kickstart/` и монтирует
через сгенерированный Compose override. Так статические ключи и старые
Macro-идентификаторы не могут попасть в ручной локальный bootstrap.
