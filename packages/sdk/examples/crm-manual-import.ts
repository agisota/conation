import { Macro } from '../src/macro';

type CompanyInput = {
  name?: string;
  domain?: string;
  id?: string;
  rename?: string;
  note?: string;
};

type ContactInput = {
  companyDomain?: string;
  name?: string;
  email?: string;
  id?: string;
  rename?: string;
  note?: string;
};

type DocumentInput = { name?: string; markdown?: string };

type Input = {
  companies?: CompanyInput[];
  contacts?: ContactInput[];
  documents?: DocumentInput[];
};
const GENERIC_EMAIL_DOMAINS = new Set([
  'aol.com',
  'gmail.com',
  'googlemail.com',
  'gmx.com',
  'hotmail.com',
  'icloud.com',
  'live.com',
  'mail.com',
  'me.com',
  'msn.com',
  'outlook.com',
  'proton.me',
  'protonmail.com',
  'yahoo.com',
  'yandex.com',
]);

function parseArgs(args: string[]) {
  const inputFlags = args.flatMap((arg, index) =>
    arg === '--input' ? [index] : [],
  );
  const applyFlags = args.filter((arg) => arg === '--apply').length;
  const inputIndex = inputFlags[0];
  const inputPath = inputIndex === undefined ? undefined : args[inputIndex + 1];
  const unexpectedArgs = args.filter(
    (arg, index) =>
      index !== inputIndex && index !== inputIndex + 1 && arg !== '--apply',
  );
  if (
    inputFlags.length !== 1 ||
    applyFlags > 1 ||
    !inputPath ||
    inputPath.startsWith('--') ||
    unexpectedArgs.length > 0
  ) {
    throw new Error(
      'Usage: bun run packages/sdk/examples/crm-manual-import.ts --input <file.json> [--apply]',
    );
  }
  return { apply: applyFlags === 1, inputPath };
}

type ValidatedCompany =
  | { kind: 'create'; name: string; domain: string; note: string | undefined }
  | { kind: 'rename'; id: string; rename: string; note: string | undefined };

type ValidatedContact =
  | {
      kind: 'create';
      companyDomain: string;
      name: string;
      email: string;
      note: string | undefined;
    }
  | { kind: 'rename'; id: string; rename: string; note: string | undefined };

type ValidatedInput = {
  companies: ValidatedCompany[];
  contacts: ValidatedContact[];
  documents: Array<{ name: string; markdown: string }>;
  operations: string[];
};

function validate(input: Input): ValidatedInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Input must be a JSON object');
  }
  for (const [label, rows] of Object.entries({
    companies: input.companies,
    contacts: input.contacts,
    documents: input.documents,
  })) {
    if (
      rows !== undefined &&
      (!Array.isArray(rows) ||
        rows.some(
          (row) => !row || typeof row !== 'object' || Array.isArray(row),
        ))
    ) {
      throw new Error(`${label} must be an array of objects`);
    }
  }

  const operations: string[] = [];
  const companies: ValidatedCompany[] = [];
  const contacts: ValidatedContact[] = [];
  const documents: ValidatedInput['documents'] = [];
  const identities = new Set<string>();
  const addIdentity = (identity: string) => {
    if (identities.has(identity))
      throw new Error(`Duplicate input operation: ${identity}`);
    identities.add(identity);
  };
  const validatedNote = (value: string | undefined, target: string) => {
    if (value === undefined) return undefined;
    const text = value.trim();
    if (!text) throw new Error('Notes cannot be blank');
    operations.push(`Append markdown note to ${target}`);
    return text;
  };

  for (const company of input.companies ?? []) {
    if (company.id !== undefined) {
      const id = company.id.trim();
      const rename = company.rename?.trim();
      if (!id || !rename) {
        throw new Error(
          'Company updates require an explicit id and non-blank rename',
        );
      }
      addIdentity(`company:${id}`);
      operations.push(`Rename company ${id}`);
      companies.push({
        kind: 'rename',
        id,
        rename,
        note: validatedNote(company.note, id),
      });
      continue;
    }
    const name = company.name?.trim();
    const domain = company.domain?.trim();
    if (
      !name ||
      !domain ||
      /[\s/:@]/.test(domain) ||
      !domain.includes('.') ||
      GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase())
    ) {
      throw new Error('Company creation requires a name and bare domain');
    }
    const normalizedDomain = domain.toLowerCase();
    addIdentity(`company-domain:${normalizedDomain}`);
    operations.push(`Create company ${name} (${domain})`);
    companies.push({
      kind: 'create',
      name,
      domain: normalizedDomain,
      note: validatedNote(company.note, domain),
    });
  }

  for (const contact of input.contacts ?? []) {
    if (contact.id !== undefined) {
      const id = contact.id.trim();
      const rename = contact.rename?.trim();
      if (!id || !rename) {
        throw new Error(
          'Contact updates require an explicit id and non-blank rename',
        );
      }
      addIdentity(`contact:${id}`);
      operations.push(`Rename contact ${id}`);
      contacts.push({
        kind: 'rename',
        id,
        rename,
        note: validatedNote(contact.note, id),
      });
      continue;
    }
    const name = contact.name?.trim();
    const email = contact.email?.trim();
    const companyDomain = contact.companyDomain?.trim();
    const emailParts = email?.split('@');
    if (
      !name ||
      !email ||
      !companyDomain ||
      emailParts?.length !== 2 ||
      !emailParts[0] ||
      !emailParts[1]
    ) {
      throw new Error(
        'Contact creation requires companyDomain, name, and email',
      );
    }
    if (emailParts[1].toLowerCase() !== companyDomain.toLowerCase()) {
      throw new Error('Contact email domain must match companyDomain');
    }
    addIdentity(`contact-email:${email.toLowerCase()}`);
    operations.push(`Create contact ${email} under company ${companyDomain}`);
    contacts.push({
      kind: 'create',
      companyDomain: companyDomain.toLowerCase(),
      name,
      email,
      note: validatedNote(contact.note, email),
    });
  }

  for (const document of input.documents ?? []) {
    const name = document.name?.trim();
    const markdown = document.markdown?.trim();
    if (!name || !markdown) {
      throw new Error('Documents require a name and markdown');
    }
    addIdentity(`document:${name.toLowerCase()}`);
    operations.push(`Create markdown document ${name}`);
    documents.push({ name, markdown });
  }

  if (!operations.length) throw new Error('Input contains no operations');
  return { companies, contacts, documents, operations };
}

export async function run(args = process.argv.slice(2)) {
  const { apply, inputPath } = parseArgs(args);
  const input = validate(JSON.parse(await Bun.file(inputPath).text()) as Input);
  const hasAppendOnlyWrites =
    input.companies.some((item) => item.note !== undefined) ||
    input.contacts.some((item) => item.note !== undefined) ||
    input.documents.length > 0;

  console.log(`${apply ? 'APPLY' : 'DRY RUN'}: ${input.operations.join('; ')}`);
  if (hasAppendOnlyWrites) {
    console.warn(
      'Notes and documents append on every run; reruns may create duplicates.',
    );
  }
  if (!apply) return true;

  const apiKey = process.env.MACRO_API_KEY;
  if (!apiKey?.trim() || !apiKey.startsWith('mak_')) {
    throw new Error(
      'Set MACRO_API_KEY to a user API key from Settings → API Keys before applying',
    );
  }
  if (hasAppendOnlyWrites && process.env.CONFIRM_APPEND_ONLY !== 'yes') {
    throw new Error(
      'Notes and documents are append-only; reruns may duplicate them. Set CONFIRM_APPEND_ONLY=yes to confirm this apply.',
    );
  }

  const macro = new Macro({});
  const completed: string[] = [];
  try {
    for (const company of input.companies) {
      if (company.kind === 'rename') {
        const entity = macro.crm.companyById(company.id);
        await entity.rename(company.rename);
        completed.push(`renamed company ${company.id}`);
        if (company.note !== undefined) {
          await entity.comment({ text: company.note });
          completed.push(`company note ${company.id}`);
        }
      } else {
        const entity = await macro.crm.createCompany({
          name: company.name,
          domain: company.domain,
        });
        completed.push(`created company ${company.domain}`);
        if (company.note !== undefined) {
          await entity.comment({ text: company.note });
          completed.push(`company note ${company.domain}`);
        }
      }
    }

    for (const contact of input.contacts) {
      if (contact.kind === 'rename') {
        const entity = macro.crm.contactById(contact.id);
        await entity.rename(contact.rename);
        completed.push(`renamed contact ${contact.id}`);
        if (contact.note !== undefined) {
          await entity.comment({ text: contact.note });
          completed.push(`contact note ${contact.id}`);
        }
        continue;
      }

      let exactMatchFound = false;
      for await (const match of macro.crm.searchCompanies(
        contact.companyDomain,
      )) {
        const domains = await match.domains();
        if (
          !domains.some(
            (domain) => domain.toLowerCase() === contact.companyDomain,
          )
        )
          continue;
        const entity = await match.createContact({
          name: contact.name,
          email: contact.email,
        });
        completed.push(`created contact ${contact.email.toLowerCase()}`);
        if (contact.note !== undefined) {
          await entity.comment({ text: contact.note });
          completed.push(`contact note ${contact.email.toLowerCase()}`);
        }
        exactMatchFound = true;
        break;
      }
      if (!exactMatchFound) {
        throw new Error(
          `No exact company-domain match for ${contact.companyDomain}; create the company first`,
        );
      }
    }

    for (const document of input.documents) {
      await macro.documents.create(document);
      completed.push(`document ${document.name}`);
    }
    console.log(`Completed: ${completed.join(', ')}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const resolution = /\b409\b|conflict/i.test(message)
      ? `Resolve the CRM conflict manually; no automatic retry was attempted. Original error: ${message}`
      : message;
    console.error(
      `Stopped after partial success (${completed.length} completed): ${completed.join(', ') || 'none'}. ${resolution}`,
    );
    return false;
  }
}

if (import.meta.main) {
  try {
    if (!(await run())) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
