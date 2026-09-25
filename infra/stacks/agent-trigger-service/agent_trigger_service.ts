import * as aws from '@pulumi/aws';
import * as awsx from '@pulumi/awsx';
import * as pulumi from '@pulumi/pulumi';
import {
  DATADOG_API_KEY,
  DEFAULT_CONTINUE_BEFORE_STEADY_STATE,
  datadogAgentContainer,
  fargateLogRouterSidecarContainer,
} from '../../packages/resources';
import { EcrImage } from '../../packages/service';
import { getKafkaClusterPolicy, stack } from '../../packages/shared';

const BASE_NAME = pulumi.getProject();
const REPO_ROOT = '../../..';
const HARNESS_DOPPLER_SECRET = `/doppler-sync/agent-harness-service/${stack}/doppler`;

type Args = {
  vpc: {
    vpcId: pulumi.Output<string> | string;
    privateSubnetIds: pulumi.Output<string[]> | string[];
  };
  tags: { [key: string]: string };
  platform: { family: string; architecture: 'amd64' | 'arm64' };
  ecsClusterArn: pulumi.Output<string> | string;
};

/** Runs the committed-post trigger generator independently from the harness. */
export class AgentTriggerService extends pulumi.ComponentResource {
  public role: aws.iam.Role;
  public service: awsx.ecs.FargateService;

  constructor(name: string, args: Args, opts?: pulumi.ComponentResourceOptions) {
    super('my:components:AgentTriggerService', name, {}, opts);
    const { vpc, tags, platform, ecsClusterArn } = args;

    const image = new EcrImage(
      `${BASE_NAME}-ecr-image-${stack}`,
      {
        repositoryId: `${BASE_NAME}-ecr-${stack}`,
        repositoryName: `${BASE_NAME}-${stack}`,
        imageId: `${BASE_NAME}-image-${stack}`,
        imagePath: REPO_ROOT,
        dockerfile: 'docker/Dockerfile',
        platform,
        buildArgs: { SERVICE_NAME: 'agent_trigger_service' },
        tags,
      },
      { parent: this },
    );

    const serviceSg = new aws.ec2.SecurityGroup(
      `${BASE_NAME}-sg-${stack}`,
      {
        name: `${BASE_NAME}-sg-${stack}`,
        vpcId: vpc.vpcId,
        description: 'Agent trigger worker outbound access',
        tags,
      },
      { parent: this },
    );
    new aws.vpc.SecurityGroupEgressRule(
      `${BASE_NAME}-service-out-${stack}`,
      {
        securityGroupId: serviceSg.id,
        description: 'Allow outbound access to MacroDB, Kafka, and internal services',
        cidrIpv4: '0.0.0.0/0',
        ipProtocol: '-1',
        tags,
      },
      { parent: this },
    );

    this.role = new aws.iam.Role(
      `${BASE_NAME}-task-role-${stack}`,
      {
        name: `${BASE_NAME}-task-role-${stack}`,
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
          Service: 'ecs-tasks.amazonaws.com',
        }),
        managedPolicyArns: [],
        tags,
      },
      { parent: this },
    );
    const kafkaPolicyAttachment = new aws.iam.RolePolicyAttachment(
      `${BASE_NAME}-kafka-client-att-${stack}`,
      { role: this.role.name, policyArn: getKafkaClusterPolicy() },
      { parent: this, dependsOn: [this.role] },
    );

    // Reuse the harness's synced application config; no provider-side secret
    // changes or duplicate secret source are needed for this worker.
    const dopplerSecretArn = aws.secretsmanager
      .getSecretVersionOutput({ secretId: HARNESS_DOPPLER_SECRET })
      .apply((secret) => secret.arn);
    const executionSecretsPolicy = new aws.iam.Policy(
      `${BASE_NAME}-execution-secrets-policy-${stack}`,
      {
        name: `${BASE_NAME}-execution-secrets-policy-${stack}`,
        policy: pulumi.jsonStringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Action: ['secretsmanager:GetSecretValue'],
              Resource: dopplerSecretArn,
            },
          ],
        }),
        tags,
      },
      { parent: this },
    );
    const executionRole = new aws.iam.Role(
      `${BASE_NAME}-execution-role-${stack}`,
      {
        name: `${BASE_NAME}-execution-role-${stack}`,
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
          Service: 'ecs-tasks.amazonaws.com',
        }),
        managedPolicyArns: [
          'arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy',
          executionSecretsPolicy.arn,
        ],
        tags,
      },
      { parent: this },
    );

    this.service = new awsx.ecs.FargateService(
      `${BASE_NAME}`,
      {
        tags,
        cluster: ecsClusterArn,
        desiredCount: 1,
        continueBeforeSteadyState: DEFAULT_CONTINUE_BEFORE_STEADY_STATE,
        deploymentCircuitBreaker: { enable: true, rollback: true },
        deploymentMinimumHealthyPercent: 100,
        deploymentMaximumPercent: 200,
        networkConfiguration: {
          subnets: vpc.privateSubnetIds,
          securityGroups: [serviceSg.id],
        },
        taskDefinitionArgs: {
          taskRole: { roleArn: this.role.arn },
          executionRole: { roleArn: executionRole.arn },
          containers: {
            log_router: fargateLogRouterSidecarContainer,
            datadog_agent: datadogAgentContainer,
            service: {
              name: BASE_NAME,
              image: image.image.imageUri,
              stopTimeout: 120,
              cpu: 512,
              memory: 1024,
              environment: [
                { name: 'ENVIRONMENT', value: stack },
                { name: 'AGENT_TRIGGER_EVENT_SOURCE', value: 'messages' },
                { name: 'DD_SERVICE', value: 'agent-trigger-service' },
                { name: 'DD_ENV', value: stack },
              ],
              secrets: [
                { name: 'APP_SECRETS_JSON', valueFrom: dopplerSecretArn },
              ],
              logConfiguration: {
                logDriver: 'awsfirelens',
                options: {
                  Name: 'datadog',
                  Host: 'http-intake.logs.us5.datadoghq.com',
                  apikey: DATADOG_API_KEY,
                  dd_service: 'agent-trigger-service',
                  dd_source: 'fargate',
                  dd_tags: `project:agent-trigger-service, env:${stack}`,
                  provider: 'ecs',
                },
              },
            },
          },
          runtimePlatform: {
            operatingSystemFamily: platform.family.toUpperCase(),
            cpuArchitecture:
              platform.architecture === 'amd64'
                ? 'X86_64'
                : platform.architecture.toUpperCase(),
          },
        },
      },
      {
        parent: this,
        dependsOn: [executionSecretsPolicy, kafkaPolicyAttachment],
      },
    );
  }
}
