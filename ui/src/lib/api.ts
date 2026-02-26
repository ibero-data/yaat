export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function fetchAPI<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    throw new ApiError(res.status, body.error || `HTTP ${res.status}`)
  }
  return res.json()
}
