import * as aws from '@pulumi/aws';
import type * as pulumi from '@pulumi/pulumi';
import { stack } from '../../shared';

const CONATION_API_TOKEN_PUBLIC_KEY = `conation-api-token-public-key-${stack}`;

export function getConationApiToken(): {
  conationApiTokenIssuer: string;
  conationApiTokenPublicKey: string;
  conationApiTokenPublicKeyArn: pulumi.Output<string>;
} {
  return {
    conationApiTokenIssuer:
      stack === 'prod'
        ? 'authentication-service.conation.dev'
        : `authentication-service-${stack}.conation.dev`,
    conationApiTokenPublicKey: CONATION_API_TOKEN_PUBLIC_KEY,
    conationApiTokenPublicKeyArn: aws.secretsmanager
      .getSecretVersionOutput({
        secretId: CONATION_API_TOKEN_PUBLIC_KEY,
      })
      .apply((secret) => secret.arn),
  };
}
