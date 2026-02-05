import process from "node:process"

import { defineEventHandler } from "h3"

export default defineEventHandler(async () => {
  const required = ["JWT_SECRET", "G_CLIENT_ID", "G_CLIENT_SECRET"] as const
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    return {
      enable: false,
      missing,
    }
  }

  return {
    enable: true,
    url: `https://github.com/login/oauth/authorize?client_id=${process.env.G_CLIENT_ID}`,
  }
})
