import { RAG } from "@convex-dev/rag"
import { openai } from "@ai-sdk/openai"
import { v } from "convex/values"
import { components } from "./_generated/api"
import { action } from "./_generated/server"

const DIMENSION = 1536

// Every chunk and query brings its own vector, so the model is never called
// and no API key is needed.
let rag = new RAG(components.rag, {
  textEmbeddingModel: openai.embedding("text-embedding-3-small"),
  embeddingDimension: DIMENSION,
})

let randomVector = () =>
  Array.from({ length: DIMENSION }, () => Math.random() - 0.5)

/** Adds `vectors` random vectors to `namespace`, 100 per entry. */
export let seed = action({
  args: { namespace: v.string(), vectors: v.number() },
  handler: async (ctx, { namespace, vectors }) => {
    for (let start = 0; start < vectors; start += 100) {
      await rag.add(ctx, {
        namespace,
        key: `entry-${start}`,
        chunks: Array.from({ length: Math.min(100, vectors - start) }, () => ({
          text: "random",
          embedding: randomVector(),
        })),
      })
    }
  },
})

/** Searches one namespace with a random query vector. */
export let search = action({
  args: { namespace: v.string() },
  handler: async (ctx, { namespace }) => {
    let { results } = await rag.search(ctx, {
      namespace,
      query: randomVector(),
      limit: 10,
    })
    return results.length
  },
})
