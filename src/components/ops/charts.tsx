// Small dependency-free SVG charts for the Ops dashboard: line, stacked bars,
// horizontal bars, sparkline. Each one sizes itself to its container and has a
// hover tooltip; colours come from the palette in OpsApp (validated for
// colour-vision deficiency: categorical slots blue / orange / aqua, and a
// one-hue blue ramp for ordered stages).
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface Series {
  key: string;
  label: string;
  color: string;
  values: (number | undefined)[];
  dashed?: boolean;
}

export const INK = { primary: "#0b0b0b", secondary: "#52514e", muted: "#898781", grid: "#ebeae6", axis: "#c3c2b7", surface: "#ffffff" };

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** ~4 round tick values covering [min, max]. */
function niceTicks(min: number, max: number, count = 4, integer = false): number[] {
  if (max === min) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  if (integer) step = Math.max(1, Math.ceil(step));
  const lo = Math.floor(min / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= max + step * 0.5; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
  return out;
}

export const compact = (v: number) =>
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : Math.abs(v) >= 1e4 ? `${Math.round(v / 1e3)}k` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(1).replace(/\.0$/, "")}k` : `${Math.round(v * 100) / 100}`;

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), Math.max(0, width - 190));
  return (
    <div className="pointer-events-none absolute z-20 min-w-[150px] max-w-[220px] rounded-lg bg-white px-3 py-2 text-xs shadow-lg ring-1 ring-black/10" style={{ left, top: Math.max(0, y - 10) }}>
      {children}
    </div>
  );
}

const TipRow = ({ color, label, value }: { color?: string; label: string; value: string }) => (
  <div className="flex items-center justify-between gap-3 py-0.5">
    <span className="flex min-w-0 items-center gap-1.5 text-neutral-600">
      {color && <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />}
      <span className="truncate">{label}</span>
    </span>
    <span className="font-medium tabular-nums text-neutral-900">{value}</span>
  </div>
);

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.dashed ? <span className="w-3 border-t-2 border-dashed" style={{ borderColor: i.color }} /> : <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

const M = { top: 10, right: 12, bottom: 24, left: 40 };

/** Multi-line chart over weekly x labels. `zero`: start the y axis at 0 (counts). */
export function LineChart({ x, series, height = 200, format = compact, zero = true, invert = false, target }: { x: string[]; series: Series[]; height?: number; format?: (v: number) => string; zero?: boolean; invert?: boolean; target?: { value: number; label: string } }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== undefined));
  if (target) all.push(target.value);
  const has = all.length > 0;
  let min = has ? Math.min(...all) : 0;
  let max = has ? Math.max(...all) : 1;
  if (zero) min = Math.min(0, min);
  else {
    const pad = (max - min) * 0.15 || 1;
    min -= pad;
    max += pad;
  }
  const ticks = niceTicks(min, max);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const iw = Math.max(0, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const px = (i: number) => M.left + (x.length <= 1 ? iw / 2 : (i / (x.length - 1)) * iw);
  const py = (v: number) => M.top + (invert ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * ih;
  const labelEvery = Math.ceil(x.length / Math.max(1, Math.floor(iw / 56)));

  const path = (vals: (number | undefined)[]) => {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === undefined) return void (pen = false);
      d += `${pen ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - r.left) / r.width;
    setHover(Math.round(rel * (x.length - 1)));
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ")}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={py(t)} y2={py(t)} stroke={INK.grid} />
              <text x={M.left - 6} y={py(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={INK.muted} className="tabular-nums">{format(t)}</text>
            </g>
          ))}
          {x.map((l, i) => (i % labelEvery === 0 || i === x.length - 1) && (i === x.length - 1 || x.length - 1 - i >= labelEvery / 2) ? (
            <text key={i} x={px(i)} y={height - 6} textAnchor={i === x.length - 1 && x.length > 1 ? "end" : i === 0 && x.length > 1 ? "start" : "middle"} fontSize={10} fill={INK.muted}>{l}</text>
          ) : null)}
          {target && (
            <g>
              <line x1={M.left} x2={width - M.right} y1={py(target.value)} y2={py(target.value)} stroke={INK.secondary} strokeDasharray="4 4" strokeWidth={1} />
              <text x={width - M.right} y={py(target.value) - 4} textAnchor="end" fontSize={10} fill={INK.secondary}>{target.label}</text>
            </g>
          )}
          {series.map((s) => (
            <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? "5 4" : undefined} />
          ))}
          {series.map((s) =>
            s.values.map((v, i) => {
              const lone = v !== undefined && s.values[i - 1] === undefined && s.values[i + 1] === undefined;
              return lone ? <circle key={`${s.key}${i}`} cx={px(i)} cy={py(v!)} r={4} fill={s.color} stroke={INK.surface} strokeWidth={2} /> : null;
            }),
          )}
          {hover !== null && (
            <g>
              <line x1={px(hover)} x2={px(hover)} y1={M.top} y2={M.top + ih} stroke={INK.axis} />
              {series.map((s) => s.values[hover] !== undefined && <circle key={s.key} cx={px(hover)} cy={py(s.values[hover]!)} r={4.5} fill={s.color} stroke={INK.surface} strokeWidth={2} />)}
            </g>
          )}
          <rect x={M.left} y={0} width={iw} height={height} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
        </svg>
      )}
      {!has && width > 0 && <p className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">No data yet</p>}
      {hover !== null && (
        <Tooltip x={px(hover)} y={M.top} width={width}>
          <p className="mb-1 font-medium text-neutral-900">{x[hover]}</p>
          {series.map((s) => <TipRow key={s.key} color={s.color} label={s.label} value={s.values[hover] === undefined ? "–" : format(s.values[hover]!)} />)}
          {target && <TipRow label={target.label} value={format(target.value)} />}
        </Tooltip>
      )}
    </div>
  );
}

/** Stacked columns, one per x label; series stack bottom-up in the given order. */
export function StackedBars({ x, series, height = 180, format = compact, highlight }: { x: string[]; series: Series[]; height?: number; format?: (v: number) => string; highlight?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = x.map((_, i) => series.reduce((s, ser) => s + (ser.values[i] ?? 0), 0));
  // Every stacked chart here counts things, so ticks stay whole numbers.
  const ticks = niceTicks(0, Math.max(1, ...totals), 4, true);
  const hi = ticks[ticks.length - 1];
  const iw = Math.max(0, width - M.left - M.right);
  const ih = height - M.top - M.bottom;
  const band = iw / Math.max(1, x.length);
  const bw = Math.max(4, Math.min(28, band * 0.62));
  const py = (v: number) => M.top + (1 - v / hi) * ih;
  const labelEvery = Math.ceil(x.length / Math.max(1, Math.floor(iw / 56)));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={series.map((s) => s.label).join(", ")} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={width - M.right} y1={py(t)} y2={py(t)} stroke={INK.grid} />
              <text x={M.left - 6} y={py(t)} dy="0.32em" textAnchor="end" fontSize={10} fill={INK.muted} className="tabular-nums">{format(t)}</text>
            </g>
          ))}
          {x.map((l, i) => {
            const cx = M.left + band * i + band / 2;
            let acc = 0;
            const segs = series
              .map((s) => ({ s, v: s.values[i] ?? 0 }))
              .filter((g) => g.v > 0);
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                {highlight === i && <rect x={cx - band / 2} y={M.top} width={band} height={ih} fill="#0a332c" opacity={0.05} rx={4} />}
                <rect x={cx - band / 2} y={0} width={band} height={height} fill="transparent" />
                {segs.map(({ s, v }, j) => {
                  const y0 = py(acc);
                  acc += v;
                  const y1 = py(acc);
                  const top = j === segs.length - 1;
                  const h = Math.max(0, y0 - y1 - (top ? 0 : 2));
                  const r = top ? Math.min(4, h, bw / 2) : 0;
                  // Rounded top corners only on the top segment (the data end).
                  const d = `M${cx - bw / 2},${y0}V${y0 - h + r}Q${cx - bw / 2},${y0 - h} ${cx - bw / 2 + r},${y0 - h}H${cx + bw / 2 - r}Q${cx + bw / 2},${y0 - h} ${cx + bw / 2},${y0 - h + r}V${y0}Z`;
                  return <path key={s.key} d={d} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.55} />;
                })}
                {(i % labelEvery === 0 || i === highlight) && <text x={cx} y={height - 6} textAnchor="middle" fontSize={10} fill={i === highlight ? INK.primary : INK.muted} fontWeight={i === highlight ? 600 : 400}>{l}</text>}
              </g>
            );
          })}
          <line x1={M.left} x2={width - M.right} y1={py(0)} y2={py(0)} stroke={INK.axis} />
        </svg>
      )}
      {hover !== null && (
        <Tooltip x={M.left + band * hover + band / 2} y={M.top} width={width}>
          <p className="mb-1 font-medium text-neutral-900">{x[hover]}</p>
          {[...series].reverse().map((s) => <TipRow key={s.key} color={s.color} label={s.label} value={format(s.values[hover] ?? 0)} />)}
          {series.length > 1 && <div className="mt-1 border-t border-neutral-100 pt-1"><TipRow label="Total" value={format(totals[hover])} /></div>}
        </Tooltip>
      )}
    </div>
  );
}

/** Ranked horizontal bars (top pages, queries). */
export function HBars({ rows, color, format = (v: number) => v.toLocaleString(), note, action }: { rows: { label: string; value: number; change?: number }[]; color: string; format?: (v: number) => string; note?: (r: { label: string; value: number; change?: number }) => ReactNode; action?: (r: { label: string; value: number; change?: number }) => ReactNode }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-sm" title={r.label}>
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-neutral-800">{r.label}</span>
            </div>
            <div className="mt-0.5 h-1.5 rounded-full bg-neutral-100">
              <div className="h-full rounded-full transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (r.value / max) * 100)}%`, background: color }} />
            </div>
          </div>
          <span className="flex items-center gap-2 text-xs tabular-nums text-neutral-600">
            <span className="font-medium text-neutral-900">{format(r.value)}</span>
            {note?.(r)}
            {action?.(r)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Tiny trend line for stat tiles; oldest value first. */
export function Sparkline({ values, color, height = 32 }: { values: (number | undefined)[]; color: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const nums = values.filter((v): v is number => v !== undefined);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const px = (i: number) => 2 + (values.length <= 1 ? 0 : (i / (values.length - 1)) * (width - 4));
  const py = (v: number) => 3 + (max === min ? 0.5 : 1 - (v - min) / (max - min)) * (height - 6);
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === undefined) return void (pen = false);
    d += `${pen ? "L" : "M"}${px(i).toFixed(1)},${py(v).toFixed(1)}`;
    pen = true;
  });
  const lastI = values.map((v, i) => (v === undefined ? -1 : i)).filter((i) => i >= 0).pop();
  return (
    <div ref={ref} className="w-full" style={{ height }} aria-hidden>
      {width > 0 && nums.length > 1 && (
        <svg width={width} height={height}>
          <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {lastI !== undefined && <circle cx={px(lastI)} cy={py(values[lastI]!)} r={3} fill={color} />}
        </svg>
      )}
    </div>
  );
}
