"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MIN, deriveInterval, bucketize, bucketCountFor, clampWindow, fmtTick, fmtInterval, fmtSpan } from "@/lib/usageChart";

export type Series = { clientId: string; email: string; color: string; bins: [number, number][] };

// Catmull-Rom → cubic-Bézier smoothing so the line curves through the points instead
// of drawing sharp straight spikes. Control points are clamped to the plot's vertical
// band so the curve never overshoots below the baseline / above max.
function smoothPath(pts: [number, number][], topY: number, botY: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0][0]},${pts[0][1]}`;
  const clamp = (v: number) => Math.min(botY, Math.max(topY, v));
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = clamp(p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = clamp(p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;
const MIN_WIN = 15 * MIN; // finest window (→ 1-min buckets)
const MAX_WIN = 30 * DAY; // coarsest window
const ZOOM = 1.2; // per wheel notch

// Interactive multi-user activity timeline (inline SVG, no chart lib). The visible
// window is the source of truth; the bucket interval is derived from it, so scrolling
// to zoom automatically resizes the X-axis time range. Drag to pan; toggle legend chips.
export function UsageLineChart({ series, nowMs, dataStartMs, metricLabel }: { series: Series[]; nowMs: number; dataStartMs: number; metricLabel: string }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  // Most recent event across all users, for the initial framing.
  const latestMs = useMemo(() => {
    let m = 0;
    for (const s of series) { const last = s.bins[s.bins.length - 1]; if (last) m = Math.max(m, last[0] * MIN); }
    return m || nowMs;
  }, [series, nowMs]);

  // Pan/zoom range: the full last-30-days window (not just the tight data span),
  // so you can always zoom out broadly.
  const minMs = nowMs - MAX_WIN;

  // Open on a broad view that frames the activity with context around it (≥ 12h),
  // centred on the data rather than pinned to its first event.
  const initial = useMemo(() => {
    const dataSpan = Math.max(0, latestMs - dataStartMs);
    const width = Math.max(12 * HOUR, dataSpan * 2);
    const center = latestMs && dataStartMs ? (dataStartMs + latestMs) / 2 : nowMs;
    return clampWindow(center - width / 2, width, minMs, nowMs, MIN_WIN, MAX_WIN);
  }, [nowMs, latestMs, dataStartMs, minMs]);

  const [win, setWin] = useState(initial);

  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; startMs: number; endMs: number } | null>(null);

  const W = 760, H = 220, PL = 34, PR = 10, PT = 10, PB = 26;
  const innerW = W - PL - PR;
  const innerH = H - PT - PB;

  // Derive interval from the window, then align the visible edges to it so buckets
  // land on clean clock boundaries (and labels read nicely).
  const rawWindowMs = win.endMs - win.startMs;
  const intervalMin = deriveInterval(rawWindowMs);
  const intervalMs = intervalMin * MIN;
  const startMs = Math.floor(win.startMs / intervalMs) * intervalMs;
  const endMs = Math.ceil(win.endMs / intervalMs) * intervalMs;
  const n = bucketCountFor(startMs, endMs, intervalMin);

  const visible = series.filter((s) => !hidden.has(s.clientId));
  const bucketed = visible.map((s) => ({ s, pts: bucketize(s.bins, startMs, endMs, intervalMin) }));
  const max = Math.max(1, ...bucketed.flatMap((b) => b.pts));

  const x = (i: number) => PL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PT + innerH - (v / max) * innerH;
  const tickMs = (i: number) => startMs + i * intervalMs;
  const labelStep = Math.max(1, Math.ceil(n / 8));
  const anyData = series.some((s) => s.bins.length > 0);

  // Wheel zoom, centred on the cursor. A non-passive listener is required so
  // preventDefault() actually stops the page from scrolling while over the chart
  // (React's synthetic onWheel is passive and cannot).
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const vx = ((ev.clientX - rect.left) / rect.width) * W;
      const fx = Math.min(1, Math.max(0, (vx - PL) / innerW));
      setWin((cur) => {
        const curW = cur.endMs - cur.startMs;
        const tc = cur.startMs + fx * curW;
        const newW = curW * (ev.deltaY > 0 ? ZOOM : 1 / ZOOM);
        return clampWindow(tc - fx * newW, newW, minMs, nowMs, MIN_WIN, MAX_WIN);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [innerW, nowMs, minMs]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, startMs: win.startMs, endMs: win.endMs };
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const w = d.endMs - d.startMs;
    const dxData = ((e.clientX - d.x) / rect.width) * (W / innerW) * w;
    setWin(clampWindow(d.startMs - dxData, w, minMs, nowMs, MIN_WIN, MAX_WIN));
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-neutral-700">Activity over time</h2>
        <div className="flex items-baseline gap-3">
          <span className="text-xs text-neutral-400">{metricLabel} · per {fmtInterval(intervalMin)} · {fmtSpan(endMs - startMs)} window</span>
          <button onClick={() => setWin(initial)} className="text-xs font-medium text-sky-700 hover:underline">Reset</button>
        </div>
      </div>

      {!anyData ? (
        <p className="py-10 text-center text-sm text-neutral-400">No activity yet.</p>
      ) : (
        <>
          <p className="mb-1 text-[11px] text-neutral-400">Scroll to zoom · drag to pan</p>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className="w-full cursor-grab touch-none select-none active:cursor-grabbing"
            role="img"
            aria-label="Activity over time"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {/* horizontal gridlines + y labels (0, mid, max) */}
            {[0, 0.5, 1].map((f) => {
              const v = Math.round(max * f);
              const yy = y(v);
              return (
                <g key={f}>
                  <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="#f1f5f9" strokeWidth={1} />
                  <text x={PL - 6} y={yy + 3} textAnchor="end" className="fill-neutral-400" style={{ fontSize: 9 }}>{v}</text>
                </g>
              );
            })}
            {/* x labels */}
            {Array.from({ length: n }, (_, i) => i).map((i) =>
              i % labelStep === 0 || i === n - 1 ? (
                <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-neutral-400" style={{ fontSize: 9 }}>{fmtTick(tickMs(i), intervalMin)}</text>
              ) : null,
            )}
            {/* one smooth curve per visible user */}
            {bucketed.map(({ s, pts }) => (
              <path
                key={s.clientId}
                d={smoothPath(pts.map((v, i) => [x(i), y(v)]), PT, PT + innerH)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                <title>{s.email}</title>
              </path>
            ))}
          </svg>

          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            {series.map((s) => {
              const off = hidden.has(s.clientId);
              return (
                <button
                  key={s.clientId}
                  onClick={() => setHidden((h) => { const next = new Set(h); next.has(s.clientId) ? next.delete(s.clientId) : next.add(s.clientId); return next; })}
                  className={`flex items-center gap-1.5 text-xs ${off ? "text-neutral-300" : "text-neutral-600"}`}
                  title="Click to toggle"
                >
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: off ? "#d4d4d4" : s.color }} />
                  {s.email}
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
