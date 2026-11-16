import { defineApp } from "convex/server"
import rag from "@convex-dev/rag/convex.config.js"

let app = defineApp()
app.use(rag)

export default app
