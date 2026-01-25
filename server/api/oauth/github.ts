import process from "node:process"
import { SignJWT } from "jose"
import { UserTable } from "#/database/user"

export default defineEventHandler(async (event) => {
  const db = useDatabase()
  const userTable = db ? new UserTable(db) : undefined
  if (!userTable) throw new Error("db is not defined")
  if (process.env.INIT_TABLE !== "false") await userTable.init()

  const response: {
    access_token: string
    token_type: string
    scope: string
  } = await myFetch(
    `https://github.com/login/oauth/access_token`,
    {
      method: "POST",
      body: {
        client_id: process.env.G_CLIENT_ID,
        client_secret: process.env.G_CLIENT_SECRET,
        code: getQuery(event).code,
      },
      headers: {
        accept: "application/json",
      },
    },
  )

  const userInfo: {
    id: number
    name: string
    avatar_url: string
    email: string
    notification_email: string
  } = await myFetch(`https://api.github.com/user`, {
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `token ${response.access_token}`,
      // 必须有 user-agent，在 cloudflare worker 会报错
      "User-Agent": "NewsNow App",
    },
  })

  const userID = String(userInfo.id)
  await userTable.addUser(userID, userInfo.notification_email || userInfo.email, "github")

  const jwtToken = await new SignJWT({
    id: userID,
    type: "github",
  })
    .setExpirationTime("60d")
    .setProtectedHeader({ alg: "HS256" })
    .sign(new TextEncoder().encode(process.env.JWT_SECRET!))

  // Avoid leaking JWT via URL (history/logs/referrer). We return a tiny HTML page
  // that persists auth into localStorage and then redirects.
  const user = {
    avatar: userInfo.avatar_url,
    name: userInfo.name,
  }
  setResponseHeader(event, "content-type", "text/html; charset=utf-8")
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Signing in…</title>
  </head>
  <body>
    <script>
      try {
        localStorage.setItem('jwt', ${JSON.stringify(jwtToken)});
        localStorage.setItem('user', JSON.stringify(${JSON.stringify(user)}));
      } catch (e) {
        // best-effort
      }
      location.replace('/');
    </script>
  </body>
</html>`
})
