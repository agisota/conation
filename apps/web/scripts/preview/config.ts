export interface PreviewDeploymentConfig {
  readonly bucket: string;
  readonly hostSuffix: string;
}

const LEGACY_MANAGED_BUCKETS = new Set(['macro-preview-assets-dev']);
const LEGACY_MANAGED_HOST_SUFFIXES = ['macro.com', 'macroverse.workers.dev'];

function isLegacyManagedHost(hostname: string): boolean {
  return LEGACY_MANAGED_HOST_SUFFIXES.some(
    (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
}

function normalizePreviewHostSuffix(value: string | undefined): string {
  const hostSuffix = value?.trim().toLowerCase();

  if (!hostSuffix) {
    throw new Error(
      'CONATION_PREVIEW_HOST_SUFFIX must be set to the operator-controlled preview DNS suffix, for example preview.conation.example'
    );
  }

  if (
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(
      hostSuffix
    )
  ) {
    throw new Error(
      'CONATION_PREVIEW_HOST_SUFFIX must be a DNS suffix without a protocol, port, or path'
    );
  }

  if (isLegacyManagedHost(hostSuffix)) {
    throw new Error(
      `CONATION_PREVIEW_HOST_SUFFIX cannot use the managed legacy host ${hostSuffix}`
    );
  }

  return hostSuffix;
}

function validatePreviewId(previewId: string): void {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(previewId)) {
    throw new Error(
      'Preview IDs must contain only lowercase letters, numbers, and internal hyphens'
    );
  }
}

/**
 * Reads the explicit operator configuration required for a remote preview.
 *
 * There are intentionally no hosted defaults: the Conation operator owns both
 * the S3 bucket and DNS suffix used for preview deployments.
 */
export function resolvePreviewDeploymentConfig(
  environment: Record<string, string | undefined> = process.env
): PreviewDeploymentConfig {
  const bucket = environment.CONATION_PREVIEW_BUCKET?.trim();

  if (!bucket) {
    throw new Error(
      'CONATION_PREVIEW_BUCKET must be set before publishing or cleaning up a Conation preview'
    );
  }

  if (LEGACY_MANAGED_BUCKETS.has(bucket)) {
    throw new Error(
      `CONATION_PREVIEW_BUCKET cannot use the managed legacy bucket ${bucket}`
    );
  }

  return {
    bucket,
    hostSuffix: normalizePreviewHostSuffix(
      environment.CONATION_PREVIEW_HOST_SUFFIX
    ),
  };
}

export function buildPreviewOrigin(
  previewId: string,
  hostSuffix: string
): string {
  validatePreviewId(previewId);
  return `https://${previewId}.${normalizePreviewHostSuffix(hostSuffix)}`;
}

export function buildPreviewAppUrl(
  previewId: string,
  hostSuffix: string
): string {
  return `${buildPreviewOrigin(previewId, hostSuffix)}/app`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function createPreviewUrlRegex(hostSuffix: string): RegExp {
  const suffix = escapeRegExp(normalizePreviewHostSuffix(hostSuffix));
  return new RegExp(
    `https://([a-z0-9-]+)\\.${suffix}(?=[:/?#\\s\\]\\)"']|$)`,
    'i'
  );
}

export function isPreviewUrlInBody(body: string, hostSuffix: string): boolean {
  return createPreviewUrlRegex(hostSuffix).test(body);
}
