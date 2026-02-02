import { SignJWT, jwtVerify } from "jose"

export interface DetailPublicTokenPayload {
  scope: "detail"
}

function getSecretBytes(secret: string) {
  return new TextEncoder().encode(secret)
}

export async function signDetailPublicToken(params: { secret: string, ttlSeconds: number }) {
  const ttl = Math.max(1, Math.floor(params.ttlSeconds))
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = (now + ttl) * 1000

  const token = await new SignJWT({ scope: "detail" } satisfies DetailPublicTokenPayload)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .sign(getSecretBytes(params.secret))

  return { token, expiresAt }
}

export async function verifyDetailPublicToken(params: { secret: string, token: string }) {
  const { payload } = await jwtVerify(params.token, getSecretBytes(params.secret))
  if (payload?.scope !== "detail") {
    throw createError({ statusCode: 401, message: "Invalid token" })
  }
}
