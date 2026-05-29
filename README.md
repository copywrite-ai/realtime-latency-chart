# Realtime Latency Chart

Realtime canvas latency chart with monotone smoothing and edge-stable streaming.

## Features

- Real-time time-series rendering (streaming)
- Monotone cubic smoothing (prevents curve backtracking)
- Left/right edge continuity handling
- High-DPI (`devicePixelRatio`) support
- Configurable style and smoothing behavior

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173/examples/`.

## Install (library)

```bash
npm i @peng/realtime-latency-chart
```

## Usage

```ts
import { LatencyChart } from '@peng/realtime-latency-chart'

const canvas = document.querySelector('canvas')!
const chart = new LatencyChart(canvas)

chart.push(120)
chart.push(95)
chart.push(340, performance.now(), true)

window.addEventListener('resize', () => chart.resize())
```

## API

- `new LatencyChart(canvas, options?)`
- `push(value: number, ts?: number, timeout?: boolean)`
- `setOptions(partialOptions)`
- `getStats()` -> `{ latest, p95, max } | null`
- `resize()`
- `destroy()`

## Build

```bash
npm run build
```

- Library output: `dist/`
- Demo site output (for GitHub Pages): `docs/`

## GitHub Pages

This project includes `.github/workflows/pages.yml`.
On push to `main`, it builds and deploys the demo to GitHub Pages.

## License

MIT
