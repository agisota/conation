import { describe, expect, test } from "bun:test";

import { readSourceUrl } from "./grab-snapshot";

describe("readSourceUrl", () => {
	test("requires an explicit operator-owned source", () => {
		expect(() => readSourceUrl({})).toThrow("SOURCE_URL is required");
	});

	test("accepts an explicit Conation sync endpoint", () => {
		expect(readSourceUrl({ SOURCE_URL: "https://sync.conation.dev/" })).toBe(
			"https://sync.conation.dev",
		);
	});

	test.each([
		"https://sync-service-prod2.macroverse.workers.dev",
		"https://api.macro.com",
	])("rejects legacy managed source %s", (SOURCE_URL) => {
		expect(() => readSourceUrl({ SOURCE_URL })).toThrow("legacy Macro-managed");
	});

	test.each([
		"sync.conation.dev",
		"ftp://sync.conation.dev",
		"https://token@sync.conation.dev",
		"https://sync.conation.dev?token=value",
	])("rejects unsafe source URL %s", (SOURCE_URL) => {
		expect(() => readSourceUrl({ SOURCE_URL })).toThrow();
	});
});
