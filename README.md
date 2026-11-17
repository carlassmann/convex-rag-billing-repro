# Convex RAG: every search is billed for the whole vector index

**Verdict: namespaces don't reduce what a vector search costs.** A search of a
`@convex-dev/rag` namespace holding **1 vector** is billed for **every vector
in the component**. In this repro, all 5,001 vectors are billed, whichever
namespace is searched.

Convex's own engine seems to narrow the search to the namespace, and Convex
already bills text search only for what its filter matches. Vector search
billing ignores the filter ([details](#convex-narrows-the-search-but-not-the-bill)).

Search cost is therefore *searches × total index size*. If every tenant shares
one RAG component, both factors grow with the number of tenants, so the
search bill grows quadratically.

## Result

```
Index holds 5001 vectors (30.73 MB).
namespace  vectors  billed per search
tiny             1  30.75 MB ≈ 5004 vectors
ns-0           500  30.75 MB ≈ 5004 vectors
ns-1           500  30.75 MB ≈ 5004 vectors
ns-2           500  30.75 MB ≈ 5004 vectors
ns-3           500  30.75 MB ≈ 5004 vectors
ns-4           500  30.75 MB ≈ 5004 vectors
ns-5           500  30.75 MB ≈ 5004 vectors
ns-6           500  30.75 MB ≈ 5004 vectors
ns-7           500  30.75 MB ≈ 5004 vectors
ns-8           500  30.75 MB ≈ 5004 vectors
ns-9           500  30.75 MB ≈ 5004 vectors
```

This matches Convex's docs: "each search counts the full size of the vector
index it runs against, regardless of how many results it returns and
regardless of which `filterFields` it uses"
(https://docs.convex.dev/search/vector-search). `@convex-dev/rag` keeps every
namespace in one table per dimension (`vectors_1536`), with one vector index,
and filters by namespace inside it.

## Convex narrows the search, but not the bill

Convex's backend is open source. Read at commit
[`e5a8148`](https://github.com/get-convex/convex-backend/tree/e5a8148480f2b71634d426d2d773a862117b1d47),
it seems the search engine does narrow a search to the namespace, and only
billing ignores that.

**The search narrows.** Convex stores vector indexes as Qdrant segments with a
payload index on the filter fields
([`qdrant_segments.rs#L166`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/vector/src/qdrant_segments.rs#L166)),
and passes the search's filters, rag's namespace among them, to Qdrant
([`qdrant_index.rs#L272`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/vector/src/qdrant_index.rs#L272)).
It sets Qdrant's `full_scan_threshold`
([`qdrant_segments.rs#L125`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/vector/src/qdrant_segments.rs#L125)).
When a filter matches fewer vectors than that threshold, Qdrant's query
planner compares only the matching vectors instead of walking the whole graph
(https://qdrant.tech/documentation/concepts/indexing/). So the work of
searching a small namespace scales with the namespace.

**The bill doesn't.** The billed size is taken from the index's metadata
before the search runs, without the query or its filters
([`database.rs#L2741`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/database/src/database.rs#L2741)).
It is every non-deleted vector in every compacted segment
([`index_config.rs#L185`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/common/src/bootstrap_model/index/index_config.rs#L185)),
at dimensions × 4 bytes per vector
([`segment.rs#L92`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/common/src/bootstrap_model/index/vector_index/segment.rs#L92)).

**Text search already bills only what the filter matches.** It charges each
segment's size × matching documents ÷ all documents
([`search/src/lib.rs#L203`](https://github.com/get-convex/convex-backend/blob/e5a8148480f2b71634d426d2d773a862117b1d47/crates/search/src/lib.rs#L203)).
Convex has filter-aware billing; vector search just doesn't use it.

## Run it

```sh
bun install
npx convex dev --once   # creates a dev deployment
bun repro.ts            # VECTORS=500 per namespace by default
```

`repro.ts` puts 1 vector into namespace `tiny` and `VECTORS` into each of
`ns-0` … `ns-9`. It then searches each namespace once with a random query
vector. The billed size per search is `usageStats.vectorIndexReadQueryBytes`
of the rag component's `search:search`, read from `npx convex logs --jsonl`.
No embedding API key is needed: every vector is random and passed in
directly (`convex/repro.ts`).

## Notes

- Each vector is billed as 1536 × 4 bytes.
- New vectors aren't billed until Convex compacts the index. With only 500
  vectors in the index, a search was still billed 0 bytes after 10 minutes.
  The script waits until a search is billed for most of the index, so tiny
  indexes look free.

---

written with claude-opus-5-5 in claude code
