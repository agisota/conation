#!/usr/bin/env bun

const LEGACY_MANAGED_SOURCE_HOSTS = [
	"macro.com",
	"macroverse.workers.dev",
] as const;

interface SnapshotEnvironment {
	SOURCE_URL?: string;
	TARGET_URL?: string;
	APP_URL?: string;
}

/**
 * Resolves the explicit, operator-owned synchronization service from which a
 * snapshot may be imported. This tool deliberately has no managed default:
 * Conation's greenfield stack must not silently read documents from Macro.
 */
export function readSourceUrl(
	environment: SnapshotEnvironment = process.env,
): string {
	const sourceUrl = environment.SOURCE_URL;
	if (!sourceUrl) {
		throw new Error(
			"SOURCE_URL is required and must point to an operator-owned Conation sync service",
		);
	}

	let parsed: URL;
	try {
		parsed = new URL(sourceUrl);
	} catch {
		throw new Error("SOURCE_URL must be an absolute HTTP(S) URL");
	}

	if (!parsed.hostname || !["http:", "https:"].includes(parsed.protocol)) {
		throw new Error("SOURCE_URL must be an absolute HTTP(S) URL");
	}

	if (parsed.username || parsed.password || parsed.search || parsed.hash) {
		throw new Error(
			"SOURCE_URL must not contain credentials, query parameters, or a fragment",
		);
	}

	const hostname = parsed.hostname.toLowerCase();
	if (
		LEGACY_MANAGED_SOURCE_HOSTS.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`),
		)
	) {
		throw new Error(
			"SOURCE_URL must not point to a legacy Macro-managed synchronization service",
		);
	}

	return parsed.toString().replace(/\/$/, "");
}

function usage(): string {
	return [
		"usage: SOURCE_URL=https://sync.example bun run tooling/scripts/grab-snapshot.ts <token> <source-document-id> <target-local-document-id> [target-url]",
		"",
		"SOURCE_URL is required and must be an operator-owned Conation synchronization service.",
		"The target defaults to http://localhost:8787.",
	].join("\n");
}

async function main(
	argv: string[] = process.argv.slice(2),
	environment: SnapshotEnvironment = process.env,
): Promise<void> {
	if (argv.includes("--dev")) {
		throw new Error(
			"--dev is no longer supported: configure SOURCE_URL explicitly instead",
		);
	}

	const [token, sourceDocumentId, targetDocumentId, targetUrlArg] = argv;
	if (!token || !sourceDocumentId || !targetDocumentId || argv.length > 4) {
		throw new Error(usage());
	}

	const sourceUrl = readSourceUrl(environment);
	const targetUrl =
		targetUrlArg ?? environment.TARGET_URL ?? "http://localhost:8787";
	const appUrl = environment.APP_URL ?? "http://localhost:3000";

	const grab = await fetch(
		`${sourceUrl}/document/${sourceDocumentId}/snapshot`,
		{
			headers: { Authorization: `Bearer ${token}` },
		},
	);
	if (!grab.ok) {
		throw new Error(`snapshot grab failed: ${grab.status} ${grab.statusText}`);
	}
	const snapshot = new Uint8Array(await grab.arrayBuffer());

	let peers: Array<{ peer_id: string; user_id: string }> = [];
	const metadata = await fetch(
		`${sourceUrl}/document/${sourceDocumentId}/metadata`,
		{
			headers: { Authorization: `Bearer ${token}` },
		},
	);
	if (metadata.ok) {
		peers = ((await metadata.json()) as { peers?: typeof peers }).peers ?? [];
	} else {
		console.warn(
			`metadata fetch failed (${metadata.status}); continuing without peer map`,
		);
	}

	const set = await fetch(
		`${targetUrl}/document/${targetDocumentId}/set_memory_state`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ snapshot: Array.from(snapshot), peers }),
		},
	);
	if (!set.ok) {
		throw new Error(
			`set_memory_state failed: ${set.status} — ${await set.text()}`,
		);
	}

	console.log(`grabbed ${snapshot.length} bytes + ${peers.length} peers`);
	console.log(`swapped onto local document ${targetDocumentId} (in-memory)`);
	console.log(`  ${appUrl}/app/md/${targetDocumentId}`);
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
