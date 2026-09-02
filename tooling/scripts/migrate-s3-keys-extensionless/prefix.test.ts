import { describe, expect, test } from "bun:test";
import { CONATION_OWNER_PREFIX, readConationPrefix } from "./prefix";

describe("readConationPrefix", () => {
	test("uses the Conation namespace by default", () => {
		expect(readConationPrefix({})).toEqual({
			prefix: CONATION_OWNER_PREFIX,
			userPrefix: undefined,
		});
	});

	test("allows a single canonical Conation owner selector", () => {
		expect(
			readConationPrefix({ USER_PREFIX: "conation|pythia@conation.dev" }),
		).toEqual({
			prefix: CONATION_OWNER_PREFIX,
			userPrefix: "conation|pythia@conation.dev",
		});
	});

	test.each([
		"macro|",
		"conation|team/",
		"",
	])("rejects non-canonical PREFIX %p", (PREFIX) => {
		expect(() => readConationPrefix({ PREFIX })).toThrow(
			"PREFIX must be exactly",
		);
	});

	test.each([
		"macro|user@example.com",
		"conation|user@example.com/document",
	])("rejects non-owner USER_PREFIX %p", (USER_PREFIX) => {
		expect(() => readConationPrefix({ USER_PREFIX })).toThrow(
			"USER_PREFIX must be a single Conation owner ID",
		);
	});
});
