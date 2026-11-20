import qrcode from 'qrcode-generator'

/** The permanent customer address behind a shop's QR code (decision D-02). */
export function shopJoinUrl(base: string, slug: string): string {
  return `${base.replace(/\/$/, '')}/s/${slug}`
}

const NON_PUBLIC_HOST = /^(localhost|127(\.\d+){3}|\[::1\]|0\.0\.0\.0|.+\.local|.+\.test)$/i

/**
 * Base URL encoded in QR codes, from VITE_PUBLIC_APP_URL (decision D-04: domain not decided yet).
 * Printable only when it is a public https origin (no path): anything else would put a wrong,
 * permanent URL on paper, so the UI watermarks the poster and disables printing.
 */
export function qrBase(raw: string | undefined = import.meta.env.VITE_PUBLIC_APP_URL, fallback = window.location.origin) {
  const value = raw?.trim()
  if (value) {
    try {
      const url = new URL(value)
      const printable = url.protocol === 'https:' && !NON_PUBLIC_HOST.test(url.hostname)
        && (url.pathname === '/' || url.pathname === '') && !url.search && !url.hash && !url.username
      return { base: url.origin, printable }
    } catch {
      /* fall through */
    }
  }
  return { base: fallback, printable: false }
}

/** QR module matrix (error correction M; version chosen automatically). */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)))
}

/** SVG path data for the dark modules, offset by the quiet zone. */
export function qrPath(matrix: boolean[][], quiet = 4): string {
  let d = ''
  matrix.forEach((row, r) => row.forEach((dark, c) => {
    if (dark) d += `M${c + quiet} ${r + quiet}h1v1h-1z`
  }))
  return d
}

/** Standalone SVG file (black on white, 4-module quiet zone) for print shops. */
export function qrSvgFile(text: string, quiet = 4): string {
  const matrix = qrMatrix(text)
  const size = matrix.length + quiet * 2
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="1024" height="1024" shape-rendering="crispEdges">`
    + `<rect width="${size}" height="${size}" fill="#FFFFFF"/><path fill="#000000" d="${qrPath(matrix, quiet)}"/></svg>\n`
}
