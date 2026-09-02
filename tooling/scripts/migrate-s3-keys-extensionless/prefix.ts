export const CONATION_OWNER_PREFIX = "conation|";

interface PrefixEnvironment {
	PREFIX?: string;
	USER_PREFIX?: string;
}

/**
 * Reads the key-space selectors accepted by the one-off Conation migration.
 *
 * These scripts are deliberately greenfield-only: accepting an arbitrary S3
 * prefix would make an operator command capable of migrating another product's
 * objects by accident.
 */
export function readConationPrefix(
	{ PREFIX, USER_PREFIX }: PrefixEnvironment = process.env,
): {
	prefix: string;
	userPrefix: string | undefined;
} {
	const prefix = PREFIX ?? CONATION_OWNER_PREFIX;
	if (prefix !== CONATION_OWNER_PREFIX) {
		throw new Error(
			`PREFIX must be exactly "${CONATION_OWNER_PREFIX}" for this Conation-only migration; received ${JSON.stringify(prefix)}`,
		);
	}

	if (
		USER_PREFIX &&
		(!USER_PREFIX.startsWith(CONATION_OWNER_PREFIX) ||
			USER_PREFIX.includes("/"))
	) {
		throw new Error(
			`USER_PREFIX must be a single Conation owner ID beginning with "${CONATION_OWNER_PREFIX}"; received ${JSON.stringify(USER_PREFIX)}`,
		);
	}

	return { prefix, userPrefix: USER_PREFIX };
}
