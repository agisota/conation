# Инфраструктура сервиса аутентификации

`authentication-service` запускается в ECS-кластере, который экспортирует
Pulumi-стек FusionAuth. Полное имя этого стека является обязательным
deployment input:

```sh
pulumi config set authentication-service:fusionauth_stack_ref \
  '<organization>/fusion-auth/<stack>'
```

В `Pulumi.dev.yaml` и `Pulumi.prod.yaml` указаны действующие примеры Conation.
При развёртывании в другой организации замените соответствующее значение на
свой fully-qualified stack reference. В исходном коде нет fallback и нет
алиаса организации Macro.

Указанный стек должен экспортировать оба значения:

- `fusionAuthClusterArn` — ARN ECS-кластера;
- `fusionAuthClusterName` — имя ECS-кластера.

После изменения связи выполните `bash test-fusionauth-stack-ref.sh`. Проверка
подтверждает required config, отсутствие старого FusionAuth Macro reference и
явные значения в обоих закоммиченных окружениях.
