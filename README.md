# Convex RAG: every search is billed for the whole vector index

**Namespaces don't reduce vector search cost.** Searching a `@convex-dev/rag`
namespace that holds 1 vector is billed for every vector in the component.
Cost = searches × total index size, so with tenants sharing one component it
grows quadratically with tenant count.

## Result

1 vector in `tiny`, 500 in each of `ns-0` … `ns-9` (5,001 total, 30.73 MB):

| namespace | vectors | billed per search |
|---|---|---|
| `tiny` | 1 | 30.75 MB ≈ 5,004 vectors |
| `ns-0` … `ns-9` | 500 each | 30.75 MB ≈ 5,004 vectors, each |

Matches the docs: each search counts "the full size of the vector index it
runs against … regardless of which `filterFields` it uses"
(https://docs.convex.dev/search/vector-search). rag keeps all namespaces in one
table per dimension (`vectors_1536`), with one vector index.

## Convex narrows the search, not the bill

Backend source at
[`e5a8148`](https://github.com/get-convex/convex-backend/tree/e5a8148480f2b71634d426d2d773a862117b1d47):

- **Search seems to narrow:** filters, including rag's namespace, go to Qdrant
  ([`qdrant_index.rs#L272`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/vector/src/qdrant_index.rs#L272)),
  whose segments carry a payload index
  ([`qdrant_segments.rs#L166`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/vector/src/qdrant_segments.rs#L166))
  and a `full_scan_threshold`
  ([`#L125`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/vector/src/qdrant_segments.rs#L125)).
  Below that threshold, Qdrant scans only the matching vectors
  (https://qdrant.tech/documentation/concepts/indexing/).
- **Bill doesn't:** size is read from index metadata before the search, without
  the filter
  ([`database.rs#L2741`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/database/src/database.rs#L2741)):
  all non-deleted vectors in compacted segments
  ([`index_config.rs#L185`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/common/src/bootstrap_model/index/index_config.rs#L185))
  × dimensions × 4 bytes
  ([`segment.rs#L92`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/common/src/bootstrap_model/index/vector_index/segment.rs#L92)).
- **Text search bills only the filtered share:** segment size × matching ÷ all
  documents
  ([`search/src/lib.rs#L203`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/search/src/lib.rs#L203)).

## Run

```sh
bun install
npx convex dev --once   # creates a dev deployment
bun repro.ts            # VECTORS=500 per namespace
```

- Vectors are random, so no embedding API key is needed.
- Billed bytes = `usageStats.vectorIndexReadQueryBytes` of rag's
  `search:search`, from `npx convex logs --jsonl`.
- Uncompacted vectors aren't billed: 500 vectors still showed 0 bytes after
  10 min. The script waits until a search is billed for ~all of the index.

---

written with claude-opus-5-5 in claude code
