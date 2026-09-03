import { describe, expect, test } from "bun:test";
import {
	buildChangelogNavigation,
	monthForArchive,
	type NavigationEntry,
} from "./generate-changelog";

describe("monthForArchive", () => {
	test("returns Russian month forms at both valid boundaries", () => {
		expect(monthForArchive(1)).toEqual({
			title: "Январь",
			inPeriod: "январь",
		});
		expect(monthForArchive(12)).toEqual({
			title: "Декабрь",
			inPeriod: "декабрь",
		});
	});

	test("rejects invalid release-tag months before output is touched", () => {
		expect(() => monthForArchive(0)).toThrow("invalid month: 0");
		expect(() => monthForArchive(13)).toThrow("invalid month: 13");
	});
});

describe("buildChangelogNavigation", () => {
	const conationPages = [
		"changelog/conation/introduction",
		"changelog/conation/2026-09",
	];

	test("preserves the upstream archive and adds a separate Conation group", () => {
		const navigation: NavigationEntry[] = [
			"index",
			{
				group: "История изменений",
				pages: [
					{ group: "Релизы", pages: ["changelog/introduction"] },
					{ group: "2026", pages: ["changelog/2026-05"] },
				],
			},
		];
		const original = structuredClone(navigation);

		const result = buildChangelogNavigation(navigation, conationPages);

		expect(navigation).toEqual(original);
		expect(result).toEqual([
			"index",
			{
				group: "История изменений",
				pages: [
					{ group: "Релизы Conation", pages: conationPages },
					{
						group: "Релизы · исходный проект",
						pages: ["changelog/introduction"],
					},
					{
						group: "2026 · исходный проект",
						pages: ["changelog/2026-05"],
					},
				],
			},
		]);
	});

	test("is idempotent and does not duplicate release groups", () => {
		const once = buildChangelogNavigation(
			[
				{
					group: "История изменений",
					pages: [{ group: "Релизы", pages: ["changelog/introduction"] }],
				},
			],
			conationPages,
		);

		expect(buildChangelogNavigation(once, conationPages)).toEqual(once);
	});
});
