import * as pulumi from '@pulumi/pulumi';
import { get_coparse_api_vpc } from '../../packages/vpc';
import { stack } from '../../packages/shared';
import { AgentTriggerService } from './agent_trigger_service';

const tags = {
  environment: stack,
  env: stack,
  tech_lead: 'wolf',
  project: 'agent-trigger-service',
  service: 'agent-trigger-service',
};

const cloudStorageStack = new pulumi.StackReference('cloud-storage-stack', {
  name: `macro-inc/document-storage/${stack}`,
});
const cloudStorageClusterArn = cloudStorageStack
  .getOutput('cloudStorageClusterArn')
  .apply((value) => value as string);

const service = new AgentTriggerService(`agent-trigger-service-${stack}`, {
  vpc: get_coparse_api_vpc(),
  tags,
  platform: { family: 'linux', architecture: 'amd64' },
  ecsClusterArn: cloudStorageClusterArn,
});

export const agentTriggerServiceRoleArn = service.role.arn;
export const agentTriggerServiceArn = service.service.service.arn;
