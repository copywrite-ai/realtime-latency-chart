import { LatencyChart } from '../src/index'

const canvas = document.querySelector<HTMLCanvasElement>('#chart')!
const statsEl = document.querySelector<HTMLSpanElement>('#stats')!
const toggleBtn = document.querySelector<HTMLButtonElement>('#toggle')!
const spikeBtn = document.querySelector<HTMLButtonElement>('#spike')!

const chart = new LatencyChart(canvas)
let paused = false
let last = performance.now()

function sampleLatency(): number {
  const noise = (Math.random() - 0.5) * 18
  const wave = Math.sin(performance.now() / 650) * 12
  return Math.max(20, 85 + noise + wave)
}

let spikeUntil = 0
function tick(now: number): void {
  if (!paused && now - last > 120) {
    const base = sampleLatency()
    const value = now < spikeUntil ? base + 240 : base
    const timeout = now < spikeUntil && Math.random() > 0.75
    chart.push(value, now, timeout)
    const stats = chart.getStats()
    statsEl.textContent = stats
      ? `${Math.round(stats.latest)} | p95 ${Math.round(stats.p95)} | max ${Math.round(stats.max)}`
      : '-'
    last = now
  }
  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)

toggleBtn.addEventListener('click', () => {
  paused = !paused
  toggleBtn.textContent = paused ? 'Resume' : 'Pause'
})

spikeBtn.addEventListener('click', () => {
  spikeUntil = performance.now() + 3000
})

window.addEventListener('resize', () => chart.resize())
