// ===== 丸印鑑（電子印影）描画ロジック（2026-07-09） =====
// 従業員が入力したフルネームから、クラウドサイン方式の丸印鑑画像をCanvasで生成する。
// 日本語名・アルファベット名のどちらも同じ丸型・横書きで統一（トーク履歴の確定仕様）。
// 短い名前は1行、長い名前は2行に折り返し、収まらない場合は文字サイズを自動縮小する。

const SEAL_COLOR = '#C0392B'
const FONT_FAMILY = '"Hiragino Mincho ProN","Yu Mincho",serif'

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number
): number {
  let size = startSize
  while (size > minSize) {
    ctx.font = `${size}px ${FONT_FAMILY}`
    if (ctx.measureText(text).width <= maxWidth) return size
    size -= 1
  }
  return minSize
}

// 氏名を1行に収めるか2行に分割するかを判定する。
// スペース（全角・半角）があればそこで分割を優先し、無ければ文字数の中間で分割する。
function splitName(name: string): [string, string] {
  if (name.length <= 6) return [name, '']
  const spaceIdx = name.search(/[\s　]/)
  if (spaceIdx > 0 && spaceIdx < name.length - 1) {
    return [name.slice(0, spaceIdx).trim(), name.slice(spaceIdx + 1).trim()]
  }
  const mid = Math.ceil(name.length / 2)
  return [name.slice(0, mid), name.slice(mid)]
}

// canvasに丸印鑑を描画する。背景は透明のまま（円の外側は塗らない）。
export function drawSeal(canvas: HTMLCanvasElement, rawName: string) {
  const name = (rawName || '').trim()
  const size = canvas.width
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, size, size)

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.46

  ctx.strokeStyle = SEAL_COLOR
  ctx.lineWidth = size * 0.035
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  if (!name) return

  ctx.fillStyle = SEAL_COLOR
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const maxWidth = r * 2 * 0.74

  const [line1, line2] = splitName(name)

  if (line2) {
    const fs1 = fitFontSize(ctx, line1, maxWidth, size * 0.22, size * 0.07)
    const fs2 = fitFontSize(ctx, line2, maxWidth, size * 0.22, size * 0.07)
    const fs = Math.min(fs1, fs2)
    ctx.font = `${fs}px ${FONT_FAMILY}`
    ctx.fillText(line1, cx, cy - fs * 0.58)
    ctx.fillText(line2, cx, cy + fs * 0.58)
  } else {
    const fs = fitFontSize(ctx, line1, maxWidth, size * 0.3, size * 0.09)
    ctx.font = `${fs}px ${FONT_FAMILY}`
    ctx.fillText(line1, cx, cy)
  }
}
