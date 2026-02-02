import { defineEventHandler } from "h3"
import pkg from "../../package.json" assert { type: "json" }

export default defineEventHandler(async () => {
  return {
    v: pkg.version,
  }
})
