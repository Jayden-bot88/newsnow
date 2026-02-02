type Task<T> = () => Promise<T>

function createLimiter(max: number) {
  let active = 0
  const queue: Array<() => void> = []

  const next = () => {
    if (active >= max) return
    const job = queue.shift()
    if (!job) return
    job()
  }

  return async function run<T>(task: Task<T>): Promise<T> {
    if (max <= 0 || !Number.isFinite(max)) return task()
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active += 1
        task()
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            next()
          })
      }
      queue.push(start)
      next()
    })
  }
}

// Avoid request storms when many sources are enabled (e.g. 60+).
// This only limits frontend concurrency; server-side concurrency is handled separately.
const runLimited = createLimiter(6)

export async function apiFetch<T = unknown>(url: string, options?: any): Promise<T> {
  return runLimited(() => myFetch(url, options)) as Promise<T>
}
