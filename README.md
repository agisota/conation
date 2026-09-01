# macro-inc/macro GitHub metadata archive

This orphan branch is a point-in-time, provenance-preserving archive of the public upstream GitHub metadata copied into the private agisota/conation repository.

GitHub does not allow a private personal-account repository to remain in the public upstream fork network, and its normal importer does not preserve issues or pull requests. Recreating the objects through the Issues API would falsely attribute every item to agisota and replace original timestamps and identifiers. The compressed API records therefore remain canonical.

## Snapshot

- Upstream: https://github.com/macro-inc/macro
- Git commit graph: 701 branches, 222 tags, 6,117 pull refs
- GitHub objects: 6,035 pull requests and 48 ordinary issues
- Conversation comments: 10,584
- Pull-request reviews: 6,386 (stored inside 6,035 per-PR records)
- Inline review comments: 8,726
- Issue and pull-request events: 38,952
- Releases: 208

Pull refs are published in the destination under refs/archive/upstream-pull/* because GitHub reserves refs/pull/* as a read-only namespace. MANIFEST.json records the upstream main SHA, archive timestamp, counts, byte sizes, and SHA-256 digest for every payload.

## Verify and inspect

```bash
sha256sum -c SHA256SUMS
zstd -dc raw/issues.jsonl.zst | jq -c "select(.pull_request == null)"
zstd -dc raw/pulls.jsonl.zst | jq -c .
zstd -dc raw/pull-reviews.jsonl.zst | jq -c .
```

To fetch the archived pull refs into a bare archival clone:

```bash
git fetch origin '+refs/archive/upstream-pull/*:refs/archive/upstream-pull/*'
```

The source repository is active; this is an immutable point-in-time archive, not a live bidirectional issue mirror.
