# Инфраструктура сервиса агентного контура

Сервис агентного контура запускается в ECS-кластере, который экспортирует
Pulumi-стек `document-storage`. Ссылка на этот стек намеренно является явным
deployment input:

```sh
pulumi config set agent-harness-service:cloud_storage_stack_ref \
  '<organization>/document-storage/<stack>'
```

В `Pulumi.dev.yaml` и `Pulumi.prod.yaml` записаны текущие значения Conation.
Перед развёртыванием в другой организации замените соответствующее значение на
полное имя стека, экспортирующего и `cloudStorageClusterArn`, и
`cloudStorageClusterName`. В исходном коде нет fallback и нет алиаса
организации Macro.

После изменения этой связи запустите `bash test-cloud-storage-stack-ref.sh`.
Проверка убеждается, что оба закоммиченных окружения задают явную ссылку не на
Macro и что TypeScript-программа требует этот параметр.
