import { expect, test } from "bun:test";
import { unstable_readConfig } from "wrangler";

test("local Wrangler profile uses the local Sync endpoint without a remote binding", () => {
	const config = unstable_readConfig(
		{
			config: new URL("../wrangler.jsonc", import.meta.url).pathname,
			env: "local",
		},
		{ hideWarnings: true },
	);

	expect(config.vars.SYNC_SERVICE_URL).toBe("http://localhost:8787");
	expect(config.services).toEqual([]);
});
