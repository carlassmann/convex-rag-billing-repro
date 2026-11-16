# Convex RAG: every search is billed for the whole vector index

**Verdict: namespaces don't reduce what a vector search costs.** A search of a
`@convex-dev/rag` namespace holding **1 vector** is billed for **every vector
in the component**. In this repro, all 5,001 vectors are billed, whichever
namespace is searched.

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
