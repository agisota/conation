/**
 * Pulls releases from the configured Conation repository matching the
 * vYYYY.M.D.N format
 * and generates changelog MDX pages using <Update> components: one
 * landing page (introduction.mdx) with the latest month's releases, plus
 * one archive page per month so no single route carries every release.
 *
 * Usage: bun run scripts/generate-changelog.ts
 *
 * Requires: GITHUB_TOKEN env var (or gh CLI auth)
 */

import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";

// A clean Conation deployment owns its release history. Operators that use a
// different private mirror can set this to `owner/repository` in CI; upstream
// release history remains an archive and is never rewritten by this generator.
const REPO = process.env.CONATION_CHANGELOG_REPOSITORY ?? "agisota/conation";
// Generated Conation releases live apart from the imported upstream archive in
// `changelog/`. Never let a refresh erase attributed upstream history.
const CONATION_CHANGELOG_DIR = join(
  import.meta.dirname,
  "../changelog/conation"
);
const CONATION_CHANGELOG_ROUTE = "changelog/conation";
const DOCS_JSON_PATH = join(import.meta.dirname, "../docs.json");
const TAG_PATTERN = /^v\d{4}\.\d{1,2}\.\d{1,2}\.\d+$/;

interface Release {
  tag_name: string;
  name: string | null;
  body: string | null;
  published_at: string;
}

async function fetchAllReleases(): Promise<Release[]> {
  const releases: Release[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }

    const batch: Release[] = await res.json();
    if (batch.length === 0) break;

    releases.push(...batch);
    page++;
  }

  return releases;
}

function escapeForMdx(text: string): string {
  return text.replace(
    /<(?!\/?(?:br|hr|img|a |ul|ol|li|p |h[1-6]|code|pre|em|strong|b |i |table|thead|tbody|tr|td|th|div|span|sup|sub|blockquote|details|summary|dd|dl|dt|del|ins|kbd|mark|s |u |var|wbr|abbr|cite|dfn|q |ruby|rt|rp|samp|small|time|data|meter|progress|output|dialog|slot|template|picture|source|track|video|audio|canvas|map|area|section|nav|article|aside|header|footer|main|figure|figcaption|caption|col|colgroup|fieldset|legend|datalist|optgroup|option|textarea|select|button|label|input|form))/g,
    "\\<"
  );
}

const MONTHS = [
  { title: "Январь", inPeriod: "январь" },
  { title: "Февраль", inPeriod: "февраль" },
  { title: "Март", inPeriod: "март" },
  { title: "Апрель", inPeriod: "апрель" },
  { title: "Май", inPeriod: "май" },
  { title: "Июнь", inPeriod: "июнь" },
  { title: "Июль", inPeriod: "июль" },
  { title: "Август", inPeriod: "август" },
  { title: "Сентябрь", inPeriod: "сентябрь" },
  { title: "Октябрь", inPeriod: "октябрь" },
  { title: "Ноябрь", inPeriod: "ноябрь" },
  { title: "Декабрь", inPeriod: "декабрь" },
];

/** Year and month parsed from a vYYYY.M.D.N tag. */
function tagMonth(tag: string): { year: number; month: number } {
  const [year, month] = tag.slice(1).split(".").map(Number);
  return { year, month };
}

function renderUpdate(r: Release, current: boolean): string {
  const label = current ? `${r.tag_name} (текущий)` : r.tag_name;
  const body = escapeForMdx((r.body ?? "").trim());
  return `    <Update label="${label}">\n${body}\n    </Update>`;
}

export type NavigationEntry = string | { group?: unknown; pages?: unknown };

function isNavigationGroup(
  entry: NavigationEntry
): entry is { group: string; pages: NavigationEntry[] } {
  return (
    typeof entry !== "string" &&
    typeof entry.group === "string" &&
    Array.isArray(entry.pages)
  );
}

function isChangelogNavigationGroup(entry: NavigationEntry): boolean {
  if (typeof entry === "string" || typeof entry.group !== "string") {
    return false;
  }

  const group = entry.group.toLocaleLowerCase("ru-RU");
  return group === "changelog" || group === "история изменений";
}

function isConationReleaseGroup(entry: NavigationEntry): boolean {
  return (
    typeof entry !== "string" &&
    typeof entry.group === "string" &&
    entry.group.toLocaleLowerCase("ru-RU") === "релизы conation"
  );
}

function labelUpstreamArchiveEntry(entry: NavigationEntry): NavigationEntry {
  if (!isNavigationGroup(entry)) return entry;
  if (entry.group.endsWith(" · исходный проект")) return entry;

  return { ...entry, group: `${entry.group} · исходный проект` };
}

/** Build the mixed Conation/upstream changelog navigation without mutating it. */
export function buildChangelogNavigation(
  navigationPages: NavigationEntry[],
  conationPages: string[]
): NavigationEntry[] {
  const upstreamArchive: NavigationEntry[] = [];
  const nonChangelogPages = navigationPages.filter((entry) => {
    if (!isChangelogNavigationGroup(entry)) return true;

    if (isNavigationGroup(entry)) {
      upstreamArchive.push(
        ...entry.pages.filter((page) => !isConationReleaseGroup(page))
      );
    }
    return false;
  });

  return [
    ...nonChangelogPages,
    {
      group: "История изменений",
      pages: [
        { group: "Релизы Conation", pages: conationPages },
        ...upstreamArchive.map(labelUpstreamArchiveEntry),
      ],
    },
  ];
}

export function monthForArchive(month: number) {
  const monthName = MONTHS[month - 1];
  if (!monthName) {
    throw new Error(`Release tag contains an invalid month: ${month}`);
  }
  return monthName;
}

async function main() {
  console.log(`Fetching releases from ${REPO}...`);
  const allReleases = await fetchAllReleases();

  const releases = allReleases
    .filter((r) => TAG_PATTERN.test(r.tag_name))
    .sort(
      (a, b) =>
        new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
    );

  console.log(
    `Found ${releases.length} releases matching ${TAG_PATTERN.source}`
  );

  const docsJson = JSON.parse(readFileSync(DOCS_JSON_PATH, "utf-8"));
  const navigationPages = docsJson.navigation?.pages;
  if (!Array.isArray(navigationPages)) {
    throw new Error("docs.json must contain navigation.pages before generating a changelog");
  }

  // Group releases by tag month, newest month first (releases are already
  // sorted newest-first, so insertion order is the display order)
  const months = new Map<string, Release[]>();
  for (const r of releases) {
    const { year, month } = tagMonth(r.tag_name);
    monthForArchive(month);
    const key = `${year}-${String(month).padStart(2, "0")}`;
    (months.get(key) ?? months.set(key, []).get(key)!).push(r);
  }

  const monthKeys = [...months.keys()];
  const [latestKey, ...archiveKeys] = monthKeys;
  const archiveMonths = archiveKeys.map((key) => {
    const [year, month] = key.split("-").map(Number);
    const releasesForMonth = months.get(key);
    if (!releasesForMonth) {
      throw new Error(`Missing release group for ${key}`);
    }
    return {
      key,
      year,
      monthName: monthForArchive(month),
      releases: releasesForMonth,
    };
  });

  const conationYearGroups: Array<{ group: string; pages: string[] }> = [];
  for (const { key, year } of archiveMonths) {
    let group = conationYearGroups.find(
      (candidate) => candidate.group === String(year)
    );
    if (!group) {
      group = { group: String(year), pages: [] };
      conationYearGroups.push(group);
    }
    group.pages.push(`${CONATION_CHANGELOG_ROUTE}/${key}`);
  }

  docsJson.navigation.pages = buildChangelogNavigation(
    navigationPages as NavigationEntry[],
    [
      `${CONATION_CHANGELOG_ROUTE}/introduction`,
      ...conationYearGroups.flatMap((group) => group.pages),
    ]
  );

  // All input/configuration validation happens above this line. The generator
  // owns only this directory; imported upstream MDX pages stay untouched.
  mkdirSync(CONATION_CHANGELOG_DIR, { recursive: true });
  for (const file of readdirSync(CONATION_CHANGELOG_DIR)) {
    rmSync(join(CONATION_CHANGELOG_DIR, file));
  }

  // Landing page: the latest month's releases
  const latestReleases = months.get(latestKey) ?? [];
  const latestUpdates = latestReleases.map((r, i) => renderUpdate(r, i === 0));

  const intro = `---
title: Журнал изменений Conation
icon: clock-rotate-left
description: Все заметные изменения Conation, собранные из GitHub Releases.
---

Все заметные изменения Conation, собранные из [GitHub Releases](https://github.com/${REPO}/releases).

Релизы используют формат \`vYYYY.M.D.patch\`. Импортированная история исходного проекта доступна отдельным архивом в боковой панели.

${latestUpdates.join("\n\n")}
`;

  writeFileSync(join(CONATION_CHANGELOG_DIR, "introduction.mdx"), intro);
  console.log(
    `Wrote ${CONATION_CHANGELOG_ROUTE}/introduction.mdx (${latestReleases.length} releases)`
  );

  // One archive page per earlier month
  for (const { key, year, monthName, releases: monthReleases } of archiveMonths) {
    const title = `${monthName.title} ${year}`;
    const updates = monthReleases.map((r) => renderUpdate(r, false));

    const mdx = `---
title: "${title}"
description: "Релизы Conation за ${monthName.inPeriod} ${year} года."
---

${updates.join("\n\n")}
`;

    writeFileSync(join(CONATION_CHANGELOG_DIR, `${key}.mdx`), mdx);
    console.log(
      `Wrote ${CONATION_CHANGELOG_ROUTE}/${key}.mdx (${monthReleases.length} releases)`
    );
  }

  // The Mintlify navigation uses root pages with grouped entries, not legacy
  // navigation tabs. It was fully constructed before output files were
  // cleared, so a stale config cannot erase a changelog archive.
  writeFileSync(DOCS_JSON_PATH, JSON.stringify(docsJson, null, 2) + "\n");
  console.log("Updated docs.json");
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
