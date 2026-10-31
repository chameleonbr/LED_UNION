/**
 * GIPHY search with the owner's own key. Isolated here so the rest of the app keeps
 * working if GIPHY changes or closes its API, as Tenor did in 2026.
 */
export type GiphyHit = { id: string; title: string; thumb: string; gif: string }
export type GiphyFailure = 'badKey' | 'limit' | 'network'

export class GiphyError extends Error {
  code: GiphyFailure
  constructor(code: GiphyFailure) {
    super(code)
    this.code = code
  }
}

export const PAGE = 24

export const searchUrl = (key: string, q: string, offset = 0) =>
  `https://api.giphy.com/v1/gifs/search?${new URLSearchParams({
    api_key: key, q, limit: String(PAGE), offset: String(offset), rating: 'pg-13',
  })}`

export const failureFor = (status: number): GiphyFailure =>
  status === 401 || status === 403 ? 'badKey' : status === 429 ? 'limit' : 'network'

type Img = { url?: string; size?: string }
type Raw = { id: string; title: string; images: Record<string, Img | undefined> }

// `downsized` is ≤ 2 MB and plenty for a 32-pixel panel; `original` only when smaller.
export function hitFrom(r: Raw): GiphyHit | undefined {
  const i = r.images
  const small = (x?: Img) => x?.url && Number(x.size ?? Infinity) < 2_000_000
  const gif = (small(i.original) ? i.original : i.downsized ?? i.original)?.url
  const thumb = (i.fixed_width_small ?? i.preview_gif ?? i.downsized)?.url
  return gif && thumb ? { id: r.id, title: r.title || 'GIPHY', thumb, gif } : undefined
}

export async function search(key: string, q: string, offset = 0): Promise<GiphyHit[]> {
  let res: Response
  try {
    res = await fetch(searchUrl(key, q, offset))
  } catch {
    throw new GiphyError('network')
  }
  if (!res.ok) throw new GiphyError(failureFor(res.status))
  const body = (await res.json()) as { data?: Raw[] }
  return (body.data ?? []).map(hitFrom).filter((h): h is GiphyHit => !!h)
}
