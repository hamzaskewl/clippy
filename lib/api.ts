/**
 * Tiny fetch wrapper. All paths are relative — they hit Express directly in
 * production (same origin) and proxy through next.config.ts rewrites in dev.
 */
export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(err?.error || `${res.status} ${path}`)
  }
  return res.json() as Promise<T>
}

export async function deleteJSON<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE', credentials: 'include' })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export const swrFetcher = <T,>(path: string): Promise<T> => getJSON<T>(path)
