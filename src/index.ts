export type LatencyPoint = { value: number; ts: number; timeout?: boolean }

export type LatencyChartOptions = {
  windowMs: number
  maxPoints: number
  bleedFactor: number
  lineColor: string
  areaColor: string
  gridColor: string
  textColor: string
  timeoutDotColor: string
  headDotColor: string
  headGlowColor: string
  leftFadePx: number
  paddingPx: number
  rightAnchorRatio: number
  leftAnchorEase: number
  rightHeadEase: number
  valueEase: number
  rangeEase: number
  font: string
}

const DEFAULT_OPTIONS: LatencyChartOptions = {
  windowMs: 12_000,
  maxPoints: 240,
  bleedFactor: 1.28,
  lineColor: 'rgba(255, 159, 67, 0.68)',
  areaColor: 'rgba(116, 184, 255, 0.12)',
  gridColor: 'rgba(144, 171, 204, 0.16)',
  textColor: 'rgba(171, 191, 214, 0.65)',
  timeoutDotColor: '#ff915f',
  headDotColor: 'rgba(255, 174, 92, 0.92)',
  headGlowColor: 'rgba(255, 186, 112, 0.24)',
  leftFadePx: 14,
  paddingPx: 8,
  rightAnchorRatio: 0.94,
  leftAnchorEase: 0.15,
  rightHeadEase: 0.18,
  valueEase: 0.14,
  rangeEase: 0.12,
  font: '8px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
}

type InternalPoint = { ms: number; displayMs: number; timeout: boolean; at: number }

type XY = { x: number; y: number; timeout: boolean }

export class LatencyChart {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private opts: LatencyChartOptions
  private points: InternalPoint[] = []
  private rafId: number | null = null
  private lastEma: number | null = null
  private leftAnchorY: number | null = null
  private rightHeadY: number | null = null
  private yMin: number | null = null
  private yMax: number | null = null

  constructor(canvas: HTMLCanvasElement, options: Partial<LatencyChartOptions> = {}) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D context unavailable')
    this.canvas = canvas
    this.ctx = ctx
    this.opts = { ...DEFAULT_OPTIONS, ...options }
    this.resize()
    this.start()
  }

  setOptions(options: Partial<LatencyChartOptions>): void {
    this.opts = { ...this.opts, ...options }
  }

  push(value: number, ts = performance.now(), timeout = false): void {
    const alpha = 0.28
    const filtered = timeout
      ? value
      : (this.lastEma === null ? value : this.lastEma + alpha * (value - this.lastEma))
    if (!timeout) this.lastEma = filtered

    const seed = this.points.length ? this.points[this.points.length - 1].displayMs : filtered
    this.points.push({ ms: filtered, displayMs: seed, timeout, at: ts })

    if (this.points.length > this.opts.maxPoints) this.points.shift()
    this.trim(ts)
  }

  resize(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const rect = this.canvas.getBoundingClientRect()
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr))
  }

  destroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  getStats(): { latest: number; p95: number; max: number } | null {
    if (!this.points.length) return null
    const values = this.points.map((p) => p.displayMs)
    const sorted = [...values].sort((a, b) => a - b)
    return {
      latest: values[values.length - 1],
      p95: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
      max: sorted[sorted.length - 1]
    }
  }

  private start(): void {
    const tick = (): void => {
      this.draw(performance.now())
      this.rafId = requestAnimationFrame(tick)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  private trim(now: number): void {
    const cutoff = now - this.opts.windowMs * this.opts.bleedFactor
    while (this.points.length && this.points[0].at < cutoff) this.points.shift()
  }

  private draw(now: number): void {
    this.trim(now)

    const ctx = this.ctx
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const w = this.canvas.width
    const h = this.canvas.height
    ctx.clearRect(0, 0, w, h)
    if (!this.points.length) return

    const pad = this.opts.paddingPx * dpr
    const left = pad
    const top = pad
    const right = w - pad
    const bottom = h - pad
    const chartW = Math.max(1, right - left)
    const chartH = Math.max(1, bottom - top)
    const rightAnchor = left + chartW * this.opts.rightAnchorRatio

    for (const p of this.points) {
      const a = p.timeout ? 0.22 : this.opts.valueEase
      p.displayMs += (p.ms - p.displayMs) * a
      if (Math.abs(p.ms - p.displayMs) < 0.05) p.displayMs = p.ms
    }

    const values = this.points.map((p) => p.displayMs)
    const minRaw = Math.min(...values)
    const maxRaw = Math.max(...values)
    const span = Math.max(8, maxRaw - minRaw)
    const targetMin = Math.max(0, minRaw - span * 0.2)
    const targetMax = maxRaw + span * 0.25
    if (this.yMin === null || this.yMax === null) {
      this.yMin = targetMin
      this.yMax = targetMax
    } else {
      this.yMin += (targetMin - this.yMin) * this.opts.rangeEase
      this.yMax += (targetMax - this.yMax) * this.opts.rangeEase
    }

    const yMin = this.yMin
    const yMax = this.yMax
    const ySpan = Math.max(1, yMax - yMin)

    const points: XY[] = this.points.map((p) => {
      const age = Math.max(0, now - p.at)
      const x = rightAnchor - (age / this.opts.windowMs) * chartW
      const y = top + (1 - (p.displayMs - yMin) / ySpan) * chartH
      return { x, y, timeout: p.timeout }
    }).sort((a, b) => a.x - b.x)

    if (points.length < 2) return

    const visible: XY[] = []
    const startIdx = points.findIndex((p) => p.x >= left)
    if (startIdx < 0) return

    if (startIdx > 0) {
      const a = points[startIdx - 1]
      const b = points[startIdx]
      const dx = Math.max(1e-6, b.x - a.x)
      const t = (left - a.x) / dx
      const rawY = a.y + (b.y - a.y) * t
      this.leftAnchorY = this.leftAnchorY === null
        ? rawY
        : this.leftAnchorY + (rawY - this.leftAnchorY) * this.opts.leftAnchorEase
      visible.push({ x: left, y: this.leftAnchorY, timeout: a.timeout || b.timeout })
    } else {
      this.leftAnchorY = this.leftAnchorY === null
        ? points[0].y
        : this.leftAnchorY + (points[0].y - this.leftAnchorY) * this.opts.leftAnchorEase
      visible.push({ x: left, y: this.leftAnchorY, timeout: points[0].timeout })
    }

    for (let i = startIdx; i < points.length; i += 1) {
      const p = points[i]
      if (p.x > right) break
      visible.push(p)
    }
    if (visible.length < 2) return

    const tail = visible[visible.length - 1]
    const prev = visible[visible.length - 2]
    const dx = Math.max(1e-6, tail.x - prev.x)
    const slope = (tail.y - prev.y) / dx
    const leadDx = Math.max(6 * dpr, chartW * 0.03)
    const headX = Math.min(right + leadDx, rightAnchor + leadDx)
    const headYRaw = Math.max(top, Math.min(bottom, tail.y + slope * leadDx * 0.35))
    this.rightHeadY = this.rightHeadY === null
      ? headYRaw
      : this.rightHeadY + (headYRaw - this.rightHeadY) * this.opts.rightHeadEase

    const drawPoints = [...visible, { x: headX, y: this.rightHeadY, timeout: false }]

    ctx.strokeStyle = this.opts.gridColor
    ctx.lineWidth = 1 * dpr
    ctx.fillStyle = this.opts.textColor
    ctx.font = `${8 * dpr}px ${this.opts.font.replace(/^8px\s*/, '')}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let i = 0; i <= 3; i += 1) {
      const y = top + (chartH / 3) * i
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
      const v = yMax - (i / 3) * ySpan
      ctx.fillText(`${Math.round(v)}`, 0, y)
    }

    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, right - left, bottom - top)
    ctx.clip()

    ctx.fillStyle = this.opts.areaColor
    ctx.beginPath()
    ctx.moveTo(drawPoints[0].x, bottom)
    this.drawMonotone(drawPoints)
    const last = drawPoints[drawPoints.length - 1]
    ctx.lineTo(last.x, bottom)
    ctx.closePath()
    ctx.fill()

    const fade = ctx.createLinearGradient(left, 0, left + this.opts.leftFadePx * dpr, 0)
    fade.addColorStop(0, 'rgba(0,0,0,0.22)')
    fade.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = fade
    ctx.fillRect(left, top, this.opts.leftFadePx * dpr, bottom - top)
    ctx.globalCompositeOperation = 'source-over'

    ctx.strokeStyle = this.opts.lineColor
    ctx.lineWidth = 1.8 * dpr
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(drawPoints[0].x, drawPoints[0].y)
    this.drawMonotone(drawPoints)
    ctx.stroke()

    const head = drawPoints[drawPoints.length - 1]
    ctx.fillStyle = this.opts.headGlowColor
    ctx.beginPath()
    ctx.arc(head.x, head.y, 7 * dpr, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = this.opts.headDotColor
    ctx.beginPath()
    ctx.arc(head.x, head.y, 2.1 * dpr, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()

    ctx.fillStyle = this.opts.timeoutDotColor
    for (const p of visible) {
      if (!p.timeout) continue
      ctx.beginPath()
      ctx.arc(p.x, p.y, 2.1 * dpr, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  private drawMonotone(pathPoints: Array<{ x: number; y: number }>): void {
    const c = this.ctx
    const n = pathPoints.length
    if (n < 2) return

    const h = new Array<number>(n - 1)
    const d = new Array<number>(n - 1)
    for (let i = 0; i < n - 1; i += 1) {
      const dx = Math.max(1e-6, pathPoints[i + 1].x - pathPoints[i].x)
      h[i] = dx
      d[i] = (pathPoints[i + 1].y - pathPoints[i].y) / dx
    }

    const m = new Array<number>(n)
    m[0] = d[0]
    m[n - 1] = d[n - 2]
    for (let i = 1; i < n - 1; i += 1) {
      if (d[i - 1] * d[i] <= 0) {
        m[i] = 0
      } else {
        const w1 = 2 * h[i] + h[i - 1]
        const w2 = h[i] + 2 * h[i - 1]
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
      }
    }

    c.lineTo(pathPoints[0].x, pathPoints[0].y)
    for (let i = 0; i < n - 1; i += 1) {
      const p0 = pathPoints[i]
      const p1 = pathPoints[i + 1]
      const step = h[i] / 3
      const c1x = Math.max(p0.x, Math.min(p1.x, p0.x + step))
      const c1y = p0.y + m[i] * step
      const c2x = Math.max(p0.x, Math.min(p1.x, p1.x - step))
      const c2y = p1.y - m[i + 1] * step
      c.bezierCurveTo(c1x, c1y, c2x, c2y, p1.x, p1.y)
    }
  }
}
