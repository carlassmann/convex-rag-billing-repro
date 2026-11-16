// Shows that a Convex vector search is billed for the component's whole
// vector index, not for the namespace it searches.
//
// Puts 1 vector into namespace "tiny" and VECTORS vectors into each of
// "ns-0" … "ns-9", then searches each namespace once. Every search is billed
// for about all of the vectors, including the search of "tiny".
//
// The billed bytes are `usageStats.vectorIndexReadQueryBytes` of the rag
// component's `search:search` in the deployment's function logs.

import { spawn, spawnSync } from "node:child_process"
import { createInterface } from "node:readline"

const VECTORS = Number(process.env.VECTORS ?? 500)
const NAMESPACES = Array.from({ length: 10 }, (_, index) => `ns-${index}`)
const TOTAL = 1 + VECTORS * NAMESPACES.length
const BYTES_PER_VECTOR = 1536 * 4

function run(fn: string, args: object) {
  let result = spawnSync("npx", ["convex", "run", fn, JSON.stringify(args)], {
    encoding: "utf8",
  })
  if (result.status !== 0) throw new Error(result.stderr)
}

let billedSearches: number[] = []
let logs = spawn("npx", ["convex", "logs", "--jsonl", "--success"])
createInterface({ input: logs.stdout }).on("line", (line) => {
  if (!line.startsWith("{")) return
  let event = JSON.parse(line)
  if (event.componentPath === "rag" && event.identifier === "search:search")
    billedSearches.push(event.usageStats.vectorIndexReadQueryBytes)
})

let sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
let mb = (bytes: number) => `${(bytes / 1e6).toFixed(2)} MB`
let vectorsOf = (bytes: number) => Math.round(bytes / BYTES_PER_VECTOR)

async function billedBytesOfSearch(namespace: string) {
  let before = billedSearches.length
  run("repro:search", { namespace })
  while (billedSearches.length === before) await sleep(500)
  return billedSearches[before]
}

await sleep(5000)

console.log(`Seeding 1 vector into "tiny" and ${VECTORS} into each of ${NAMESPACES.join(", ")}`)
run("repro:seed", { namespace: "tiny", vectors: 1 })
for (let namespace of NAMESPACES) run("repro:seed", { namespace, vectors: VECTORS })

// New vectors sit in an in-memory part of the index that isn't billed until
// Convex compacts it, so wait until a search is billed for most of them.
while ((await billedBytesOfSearch("tiny")) < TOTAL * BYTES_PER_VECTOR * 0.9) {
  console.log("  waiting for the index to compact…")
  await sleep(15_000)
}

console.log(`\nIndex holds ${TOTAL} vectors (${mb(TOTAL * BYTES_PER_VECTOR)}).\n`)
console.log("namespace  vectors  billed per search")
for (let [namespace, vectors] of [["tiny", 1], ...NAMESPACES.map((n) => [n, VECTORS])] as const) {
  let bytes = await billedBytesOfSearch(namespace)
  console.log(`${namespace.padEnd(9)}  ${String(vectors).padStart(7)}  ${mb(bytes)} ≈ ${vectorsOf(bytes)} vectors`)
}

logs.kill()
