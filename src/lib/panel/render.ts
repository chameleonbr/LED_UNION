/**
 * Turn a picture, GIF or text into what the panel stores: a PNG or GIF file at exactly
 * the panel's size, or 1-bit glyphs. Browser only (canvas, ImageDecoder).
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import type { Glyph } from '../protocol/ipixel-content.ts'

export type Fit = 'cover' | 'contain' | 'stretch'
export type Frame = { image: ImageData; delay: number }

/** Larger than this and the panel's memory is the likely limit, not our code (NFR-05). */
export const MAX_BYTES = 512 * 1024
export const DEFAULT_FRAMES = 60

export class RenderError extends Error {
  code: 'gifUnsupported' | 'decode' | 'tooBig'
  constructor(code: 'gifUnsupported' | 'decode' | 'tooBig') {
    super(code)
    this.code = code
  }
}

function surface(w: number, h: number) {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  return { c, ctx }
}

function draw(src: CanvasImageSource, sw: number, sh: number, w: number, h: number, fit: Fit): ImageData {
  const { ctx } = surface(w, h)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingQuality = 'high'
  if (fit === 'stretch') ctx.drawImage(src, 0, 0, w, h)
  else {
    const s = (fit === 'cover' ? Math.max : Math.min)(w / sw, h / sh)
    const dw = sw * s
    const dh = sh * s
    ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh)
  }
  return ctx.getImageData(0, 0, w, h)
}

export async function renderImage(file: Blob, w: number, h: number, fit: Fit): Promise<Frame[]> {
  const bmp = await createImageBitmap(file).catch(() => {
    throw new RenderError('decode')
  })
  const image = draw(bmp, bmp.width, bmp.height, w, h, fit)
  bmp.close()
  return [{ image, delay: 0 }]
}

// shortcut: no fallback decoder; Web Bluetooth already needs Chrome 94+, which has
// ImageDecoder. Add one (e.g. gifuct-js) if another browser ever gets Web Bluetooth.
export async function renderGif(file: Blob, w: number, h: number, fit: Fit, maxFrames = DEFAULT_FRAMES): Promise<Frame[]> {
  if (typeof ImageDecoder === 'undefined') throw new RenderError('gifUnsupported')
  const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: 'image/gif' })
  try {
    await dec.tracks.ready
    const count = Math.min(dec.tracks.selectedTrack?.frameCount ?? 1, maxFrames)
    const out: Frame[] = []
    for (let i = 0; i < count; i++) {
      const { image: vf } = await dec.decode({ frameIndex: i })
      out.push({ image: draw(vf, vf.displayWidth, vf.displayHeight, w, h, fit), delay: (vf.duration ?? 100_000) / 1000 })
      vf.close()
    }
    return out
  } catch (e) {
    throw e instanceof RenderError ? e : new RenderError('decode')
  } finally {
    dec.close()
  }
}

export async function encodePng(f: Frame): Promise<Uint8Array> {
  const { c, ctx } = surface(f.image.width, f.image.height)
  ctx.putImageData(f.image, 0, 0)
  return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer())
}

/** One palette for the whole animation, so colours do not flicker between frames. */
export function encodeGif(frames: Frame[]): Uint8Array {
  const { width: w, height: h } = frames[0].image
  const all = new Uint8ClampedArray(w * h * 4 * frames.length)
  frames.forEach((f, i) => all.set(f.image.data, i * w * h * 4))
  const palette = quantize(all, 256)
  const gif = GIFEncoder()
  frames.forEach((f, i) =>
    gif.writeFrame(applyPalette(f.image.data, palette), w, h, i ? { delay: f.delay } : { palette, delay: f.delay }),
  )
  gif.finish()
  return gif.bytes()
}

/**
 * One glyph per character, `h` pixels high: half-width cells for ordinary characters and
 * square cells for wide ones, the two shapes the legacy text format knows.
 */
export function rasterText(text: string, h: number): Glyph[] {
  const font = `bold ${Math.round(h * 0.85)}px sans-serif`
  const { ctx: m } = surface(1, 1)
  m.font = font
  return Array.from(text).map((ch) => {
    const w = m.measureText(ch).width > h / 2 + 1 ? h : h / 2
    const { ctx } = surface(w, h)
    ctx.font = font
    ctx.fillStyle = '#fff'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ch, w / 2, h / 2 + 1)
    const px = ctx.getImageData(0, 0, w, h).data
    const on = Array.from({ length: w * h }, (_, i) => px[i * 4 + 3] > 127)
    return { w, h, on }
  })
}

/** Glyphs side by side in a colour, for the preview. */
export function glyphFrame(glyphs: Glyph[], rgb: [number, number, number], w: number, h: number): Frame {
  const image = new ImageData(w, h)
  let x0 = 0
  for (const g of glyphs) {
    for (let y = 0; y < Math.min(g.h, h); y++) {
      for (let x = 0; x < g.w && x0 + x < w; x++) {
        if (!g.on[y * g.w + x]) continue
        const i = (y * w + x0 + x) * 4
        image.data.set([...rgb, 255], i)
      }
    }
    x0 += g.w
  }
  for (let i = 3; i < image.data.length; i += 4) image.data[i] = 255
  return { image, delay: 0 }
}

export const hexRgb = (c: string): [number, number, number] => {
  const n = parseInt(c.replace('#', ''), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
