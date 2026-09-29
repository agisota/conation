import { afterEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from './crm-manual-import';

const originalFetch = globalThis.fetch;
const originalApiKey = process.env.MACRO_API_KEY;
const originalEnv = process.env.MACRO_ENV;
const originalAppendConfirmation = process.env.CONFIRM_APPEND_ONLY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.MACRO_API_KEY;
  else process.env.MACRO_API_KEY = originalApiKey;
  if (originalEnv === undefined) delete process.env.MACRO_ENV;
  else process.env.MACRO_ENV = originalEnv;
  if (originalAppendConfirmation === undefined)
    delete process.env.CONFIRM_APPEND_ONLY;
  else process.env.CONFIRM_APPEND_ONLY = originalAppendConfirmation;
});

async function withInput<T>(
  input: unknown,
  action: (inputPath: string) => Promise<T>,
) {
  const inputPath = join(tmpdir(), `crm-manual-import-${randomUUID()}.json`);
  await Bun.write(inputPath, JSON.stringify(input));
  try {
    return await action(inputPath);
  } finally {
    await Bun.file(inputPath).delete();
  }
}

function recordTransport(
  handler: (request: Request) => Response | Promise<Response>,
) {
  const requests: Request[] = [];
  globalThis.fetch = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request.clone());
    return handler(request);
  };
  return requests;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const company = (id: string, domain: string) => ({
  id,
  name: 'Acme',
  description: null,
  domains: [{ domain, isPrimary: true }],
  contacts: [],
  emailSync: false,
  hidden: false,
  teamId: 'team_test',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
});

const contact = (id: string, companyId: string, email: string) => ({
  id,
  companyId,
  name: 'Jane Example',
  email,
  hidden: false,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  firstInteraction: '2026-01-01T00:00:00Z',
  lastInteraction: '2026-01-01T00:00:00Z',
});

function configureApply(key = 'mak_test_only') {
  process.env.MACRO_API_KEY = key;
  process.env.MACRO_ENV = 'dev';
  process.env.CONFIRM_APPEND_ONLY = 'yes';
}

describe('manual CRM import example', () => {
  test('dry run describes writes and sends no transport requests without credentials', async () => {
    delete process.env.MACRO_API_KEY;
    const requests = recordTransport(() => {
      throw new Error('dry-run must not reach transport');
    });
    const output: string[] = [];
    const log = console.log;
    console.log = (message) => output.push(String(message));
    try {
      await withInput(
        { companies: [{ name: 'Acme', domain: 'acme.com' }] },
        async (inputPath) => {
          await run(['--input', inputPath]);
        },
      );
    } finally {
      console.log = log;
    }
    expect(requests).toHaveLength(0);
    expect(output.join('\n')).toContain('Create company Acme (acme.com)');
  });

  test('the documented bun run command accepts its --input file path', async () => {
    const scriptPath = new URL('./crm-manual-import.ts', import.meta.url)
      .pathname;
    const result = await withInput(
      { companies: [{ name: 'Acme', domain: 'acme.com' }] },
      async (inputPath) =>
        Bun.spawnSync({
          cmd: ['bun', 'run', scriptPath, '--input', inputPath],
          env: { ...process.env, MACRO_API_KEY: '' },
          stdout: 'pipe',
          stderr: 'pipe',
        }),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(
      'DRY RUN: Create company Acme (acme.com)',
    );
  });

  test('same-import contact creation reuses its company handle without search indexing', async () => {
    configureApply();
    const requests = recordTransport(async (request) => {
      const url = new URL(request.url);
      const body = request.method === 'GET' ? undefined : await request.json();
      if (request.method === 'POST' && url.pathname === '/dss/crm/companies') {
        return jsonResponse(company('co_created', 'acme.com'));
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/dss/crm/companies/co_created/contacts'
      ) {
        return jsonResponse(
          contact('ct_created', 'co_created', 'jane@acme.com'),
        );
      }
      if (
        request.method === 'PUT' &&
        url.pathname ===
          '/dss/crm/companies/00000000-0000-4000-8000-000000000001/name'
      ) {
        return new Response(null, { status: 204 });
      }
      if (
        request.method === 'PUT' &&
        url.pathname ===
          '/dss/crm/contacts/00000000-0000-4000-8000-000000000002/name'
      ) {
        return new Response(null, { status: 204 });
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/dss/crm/comments/crm_company/co_created'
      ) {
        return jsonResponse({
          thread: {
            threadId: 'thread_test',
            entityId: 'co_created',
            entityType: 'crm_company',
            createdAt: '2026-01-01T00:00:00Z',
          },
          comments: [
            {
              commentId: 'comment_test',
              text: '# Import note',
              threadId: 'thread_test',
              owner: 'user_test',
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        });
      }
      if (
        request.method === 'POST' &&
        url.pathname === '/dss/documents/create_markdown'
      ) {
        return jsonResponse({ documentId: 'doc_test' });
      }
      throw new Error(
        `Unexpected facade request: ${request.method} ${url.pathname} ${JSON.stringify(body)}`,
      );
    });
    const input = {
      companies: [
        { name: 'Acme', domain: 'acme.com', note: '# Import note' },
        {
          id: '00000000-0000-4000-8000-000000000001',
          rename: 'Renamed Acme',
        },
      ],
      contacts: [
        {
          companyDomain: 'acme.com',
          name: 'Jane Example',
          email: 'jane@acme.com',
        },
        {
          id: '00000000-0000-4000-8000-000000000002',
          rename: 'Jane Renamed',
        },
      ],
      documents: [{ name: 'Import report', markdown: '# Report' }],
    };
    const output: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const log = console.log;
    const error = console.error;
    const warn = console.warn;
    console.log = (message) => output.push(String(message));
    console.error = (message) => errors.push(String(message));
    console.warn = (message) => warnings.push(String(message));
    try {
      await withInput(input, async (inputPath) => {
        await run(['--input', inputPath, '--apply']);
      });
    } finally {
      console.log = log;
      console.error = error;
      console.warn = warn;
    }
    expect(errors).toHaveLength(0);
    expect(
      requests.map(({ method, url }) => `${method} ${new URL(url).pathname}`),
    ).toEqual([
      'POST /dss/crm/companies',
      'POST /dss/crm/comments/crm_company/co_created',
      'PUT /dss/crm/companies/00000000-0000-4000-8000-000000000001/name',
      'POST /dss/crm/companies/co_created/contacts',
      'PUT /dss/crm/contacts/00000000-0000-4000-8000-000000000002/name',
      'POST /dss/documents/create_markdown',
    ]);
    expect(await requests[0]?.clone().json()).toEqual({
      name: 'Acme',
      domain: 'acme.com',
    });
    expect(await requests[1]?.clone().json()).toEqual({
      text: '# Import note',
    });
    expect(await requests[3]?.clone().json()).toEqual({
      name: 'Jane Example',
      email: 'jane@acme.com',
    });
    expect(await requests[4]?.clone().json()).toEqual({ name: 'Jane Renamed' });
    expect(await requests[5]?.clone().json()).toEqual({
      documentName: 'Import report',
      markdown: '# Report',
      projectId: null,
    });
    for (const request of requests) {
      expect(request.headers.get('x-macro-user-api-key')).toBe('mak_test_only');
      expect(request.headers.get('x-macro-bot-token')).toBeNull();
      expect(request.headers.get('x-macro-bot-scope')).toBeNull();
      expect(request.headers.get('authorization')).toBeNull();
    }
    expect(output.join('\n')).toContain('Completed:');
    expect(warnings.join('\n')).toContain('reruns may create duplicates');
  });

  test('apply refuses to start without MACRO_API_KEY and makes no requests', async () => {
    delete process.env.MACRO_API_KEY;
    const requests = recordTransport(() => jsonResponse({}));
    await withInput(
      { companies: [{ name: 'Acme', domain: 'acme.com' }] },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          'MACRO_API_KEY',
        );
      },
    );
    expect(requests).toHaveLength(0);
  });

  test('a fuzzy company search result with a different domain is never used for contact creation', async () => {
    configureApply();
    const requests = recordTransport((request) => {
      const pathname = new URL(request.url).pathname;
      if (request.method === 'POST' && pathname === '/dss/search') {
        return jsonResponse({
          results: [{ id: 'co_wrong', type: 'company' }],
          next_cursor: null,
        });
      }
      if (
        request.method === 'GET' &&
        pathname === '/dss/crm/companies/co_wrong'
      ) {
        return jsonResponse(company('co_wrong', 'different.org'));
      }
      throw new Error(`Unexpected request: ${request.method} ${pathname}`);
    });
    const errors: string[] = [];
    const error = console.error;
    console.error = (message) => errors.push(String(message));
    try {
      await withInput(
        {
          contacts: [
            {
              companyDomain: 'acme.com',
              name: 'Jane',
              email: 'jane@acme.com',
            },
          ],
        },
        async (inputPath) => {
          await run(['--input', inputPath, '--apply']);
        },
      );
    } finally {
      console.error = error;
    }
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/dss/search',
      '/dss/crm/companies/co_wrong',
    ]);
    expect(errors.join('\n')).toContain('No exact company-domain match');
  });

  test('duplicate records and mismatched domains fail validation before any request', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    await withInput(
      {
        companies: [
          { name: 'Acme', domain: 'acme.com' },
          { name: 'Other', domain: 'ACME.COM' },
        ],
        contacts: [
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@elsewhere.com',
          },
        ],
      },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          'Duplicate',
        );
      },
    );
    await withInput(
      {
        contacts: [
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@elsewhere.com',
          },
        ],
      },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          'must match',
        );
      },
    );
    expect(requests).toHaveLength(0);
  });

  test('normalized duplicate contact emails fail before any request', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    await withInput(
      {
        contacts: [
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@acme.com',
          },
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@acme.com.',
          },
        ],
      },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          /Duplicate/i,
        );
      },
    );
    expect(requests).toHaveLength(0);
  });

  test('invalid rename UUIDs fail before earlier create operations are sent', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    for (const input of [
      {
        companies: [
          { name: 'Acme', domain: 'acme.com' },
          { id: 'company_existing_id', rename: 'Renamed Acme' },
        ],
      },
      {
        contacts: [
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@acme.com',
          },
          { id: 'contact_existing_id', rename: 'Jane Renamed' },
        ],
      },
    ]) {
      await withInput(input, async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          /UUID/i,
        );
      });
    }
    expect(requests).toHaveLength(0);
  });


  test('case-variant UUID rename duplicates fail before any request', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    const companyId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    const contactId = 'abcdefab-cdef-4abc-8def-abcdefabcdef';
    for (const input of [
      {
        companies: [
          { name: 'Acme', domain: 'acme.com' },
          { id: companyId, rename: 'First rename' },
          { id: companyId.toUpperCase(), rename: 'Second rename' },
        ],
      },
      {
        contacts: [
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@acme.com',
          },
          { id: contactId, rename: 'First rename' },
          { id: contactId.toUpperCase(), rename: 'Second rename' },
        ],
      },
    ]) {
      await withInput(input, async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          /Duplicate/i,
        );
      });
    }
    expect(requests).toHaveLength(0);
  });

  test('201 Unicode-character names fail preflight before any batch write', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    const overlongName = '🧪'.repeat(201);
    for (const input of [
      {
        companies: [
          { name: 'Acme', domain: 'acme.com' },
          { name: overlongName, domain: 'other.com' },
        ],
      },
      {
        companies: [
          { name: 'Acme', domain: 'acme.com' },
          {
            id: 'abcdefab-cdef-4abc-8def-abcdefabcdef',
            rename: overlongName,
          },
        ],
      },
      {
        contacts: [
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@acme.com',
          },
          {
            companyDomain: 'acme.com',
            name: overlongName,
            email: 'jane2@acme.com',
          },
        ],
      },
      {
        contacts: [
          {
            companyDomain: 'acme.com',
            name: 'Jane',
            email: 'jane@acme.com',
          },
          {
            id: 'abcdefab-cdef-4abc-8def-abcdefabcdef',
            rename: overlongName,
          },
        ],
      },
    ]) {
      await withInput(input, async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          /200|too long/i,
        );
      });
    }
    expect(requests).toHaveLength(0);
  });

  test('rejects backend-invalid bare domain shapes before earlier batch writes', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    for (const domain of [
      'foo..com',
      '.foo.com',
      'foo.com?source=mail',
      'foo.com#anchor',
      'service.test.',
      `${'a'.repeat(250)}.com`,
    ]) {
      await withInput(
        {
          companies: [
            { name: 'Valid', domain: 'acme.com' },
            { name: 'Invalid', domain },
          ],
        },
        async (inputPath) => {
          await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
            /domain/i,
          );
        },
      );
    }
    expect(requests).toHaveLength(0);
  });

  test('blocked backend domains are rejected across the batch before writes', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    for (const domain of [
      'outlook.co.uk',
      'hotmail.co.uk',
      'mailinator.com',
      'github.com',
      'www.github.com',
      'maildrop.cc',
      'service.example',
      'service.invalid',
      'service.localhost',
      'service.local',
      'service.internal',
    ]) {
      await withInput(
        {
          companies: [
            { name: 'Blocked', domain },
            { name: 'Valid', domain: 'acme.com' },
          ],
        },
        async (inputPath) => {
          await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
            'blocked by CRM policy',
          );
        },
      );
    }
    await withInput(
      {
        companies: [{ name: 'Acme', domain: 'acme.com' }],
        contacts: [
          {
            companyDomain: 'mailinator.com',
            name: 'Disposable',
            email: 'jane@mailinator.com',
          },
        ],
      },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          'blocked by CRM policy',
        );
      },
    );
    expect(requests).toHaveLength(0);
  });

  test('append-only notes and documents require explicit confirmation before writes', async () => {
    configureApply();
    delete process.env.CONFIRM_APPEND_ONLY;
    const requests = recordTransport(() =>
      jsonResponse(company('co_test', 'acme.com')),
    );
    await withInput(
      { companies: [{ name: 'Acme', domain: 'acme.com', note: '# Note' }] },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          'CONFIRM_APPEND_ONLY=yes',
        );
      },
    );
    expect(requests).toHaveLength(0);
  });

  test('a 409 is actionable, is not retried, and stops the import', async () => {
    configureApply();
    const requests = recordTransport(() =>
      jsonResponse({ message: 'conflict' }, 409),
    );
    const errors: string[] = [];
    const error = console.error;
    console.error = (message) => errors.push(String(message));
    try {
      const succeeded = await withInput(
        { companies: [{ name: 'Acme', domain: 'acme.com' }] },
        (inputPath) => run(['--input', inputPath, '--apply']),
      );
      expect(succeeded).toBe(false);
    } finally {
      console.error = error;
    }
    expect(errors).toHaveLength(1);
    expect(requests).toHaveLength(1);
    expect(errors.join('\n')).toContain('409');
    expect(errors.join('\n')).toContain('no automatic retry');
  });

  test('a later transport failure stops remaining writes and counts earlier append-only success', async () => {
    configureApply();
    const requests = recordTransport(async (request) => {
      const pathname = new URL(request.url).pathname;
      if (request.method === 'POST' && pathname === '/dss/crm/companies') {
        const body = (await request.json()) as { domain?: string };
        if (body.domain === 'acme.com')
          return jsonResponse(company('co_created', 'acme.com'));
      }
      if (
        request.method === 'POST' &&
        pathname === '/dss/crm/comments/crm_company/co_created'
      ) {
        return jsonResponse({
          thread: {
            threadId: 'thread_test',
            entityId: 'co_created',
            entityType: 'crm_company',
            createdAt: '2026-01-01T00:00:00Z',
          },
          comments: [
            {
              commentId: 'comment_test',
              text: '# Import note',
              threadId: 'thread_test',
              owner: 'user_test',
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        });
      }
      return jsonResponse({ message: 'service unavailable' }, 503);
    });
    const errors: string[] = [];
    const error = console.error;
    console.error = (message) => errors.push(String(message));
    try {
      const succeeded = await withInput(
        {
          companies: [
            { name: 'Acme', domain: 'acme.com', note: '# Import note' },
            { name: 'Beta', domain: 'beta.org' },
          ],
        },
        (inputPath) => run(['--input', inputPath, '--apply']),
      );
      expect(succeeded).toBe(false);
    } finally {
      console.error = error;
    }
    expect(errors).toHaveLength(1);
    expect(requests).toHaveLength(3);
    expect(errors.join('\n')).toContain('partial success (2 completed)');
    expect(errors.join('\n')).toContain('created company acme.com');
    expect(errors.join('\n')).toContain('company note acme.com');
  });

  test('malformed arguments and blank fields fail closed', async () => {
    configureApply();
    const requests = recordTransport(() => jsonResponse({}));
    await expect(run(['--input', 'unused.json', '--unknown'])).rejects.toThrow(
      'Usage:',
    );
    await withInput(
      { companies: [{ name: '  ', domain: 'acme.com' }] },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          'name and bare domain',
        );
      },
    );
    await withInput(
      { companies: [{ name: 'Gmail', domain: 'gmail.com' }] },
      async (inputPath) => {
        await expect(run(['--input', inputPath, '--apply'])).rejects.toThrow(
          'blocked by CRM policy',
        );
      },
    );
    expect(requests).toHaveLength(0);
  });
});
