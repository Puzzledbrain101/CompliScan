import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis
} from 'recharts';
import { useChartColors, useReducedMotion } from '../lib/hooks.js';

const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const formatDay = (iso) => {
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : dayFormat.format(date);
};
const truncate = (text, max = 18) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function StatTile({ label, value, sub, tone }) {
  return (
    <div className="stat">
      <span className="stat-label">
        {tone && <span className={`dot dot-${tone}`} aria-hidden="true" />}
        {label}
      </span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

// Single-line category label; Recharts' default tick wraps long names
function BrandTick({ x, y, payload, fill }) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fill={fill} fontSize={12}>
      <title>{payload.value}</title>
      {truncate(payload.value)}
    </text>
  );
}

function ChartTooltip({ active, payload, render }) {
  if (!active || !payload?.length) return null;
  return <div className="chart-tooltip">{render(payload[0].payload)}</div>;
}

function TrendChart({ data, colors, animate }) {
  if (data.length === 0) {
    return <p className="chart-empty">Run a few checks to see how compliance changes over time.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colors.accent} stopOpacity={0.24} />
            <stop offset="100%" stopColor={colors.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={colors.grid} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={formatDay}
          tick={{ fill: colors['text-3'], fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          tick={{ fill: colors['text-3'], fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ stroke: colors.grid }}
          content={
            <ChartTooltip
              render={(d) => (
                <>
                  <span className="chart-tooltip-title">{formatDay(d.date)}</span>
                  <span>Average score <strong>{d.compliance}</strong></span>
                  <span>{d.submissions} {d.submissions === 1 ? 'check' : 'checks'}</span>
                </>
              )}
            />
          }
        />
        <Area
          type="monotone"
          dataKey="compliance"
          stroke={colors.accent}
          strokeWidth={2}
          fill="url(#trend-fill)"
          dot={data.length < 3 ? { r: 3, fill: colors.accent, strokeWidth: 0 } : false}
          activeDot={{ r: 4, fill: colors.accent, stroke: colors.surface, strokeWidth: 2 }}
          isAnimationActive={animate}
          animationDuration={400}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function BrandChart({ data, colors, animate }) {
  const withViolations = data.filter(d => d.violations > 0);
  if (withViolations.length === 0) {
    return <p className="chart-empty">No violations recorded for any manufacturer yet.</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, withViolations.length * 34 + 24)}>
      <BarChart data={withViolations} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={colors.grid} horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fill: colors['text-3'], fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="brand"
          width={150}
          tick={<BrandTick fill={colors['text-3']} />}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: colors.grid, fillOpacity: 0.5 }}
          content={
            <ChartTooltip
              render={(d) => (
                <>
                  <span className="chart-tooltip-title">{d.brand}</span>
                  <span><strong>{d.violations}</strong> {d.violations === 1 ? 'violation' : 'violations'}</span>
                  <span>{d.submissions} {d.submissions === 1 ? 'check' : 'checks'} · avg score {d.avg_score}</span>
                </>
              )}
            />
          }
        />
        <Bar
          dataKey="violations"
          fill={colors.bad}
          radius={[0, 4, 4, 0]}
          barSize={14}
          isAnimationActive={animate}
          animationDuration={400}
          animationEasing="ease-out"
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Analytics({ state, onRetry }) {
  const colors = useChartColors();
  const reducedMotion = useReducedMotion();
  const { data, loading, error } = state;
  const stats = data?.stats;
  const total = stats?.total_submissions ?? 0;

  return (
    <section className="section" aria-labelledby="analytics-heading">
      <div className="section-head">
        <h2 id="analytics-heading" className="section-title">Overview</h2>
      </div>

      {error ? (
        <div className="card inline-error">
          <p>Couldn’t load analytics. {error}</p>
          <button type="button" className="button button-secondary" onClick={onRetry}>Retry</button>
        </div>
      ) : (
        <>
          <div className="stats" aria-busy={loading || undefined}>
            {loading && !data ? (
              Array.from({ length: 5 }, (_, i) => <div key={i} className="stat skeleton-block" />)
            ) : (
              <>
                <StatTile
                  label="Checks run"
                  value={total}
                  sub={`${stats?.image_submissions ?? 0} photos · ${stats?.url_submissions ?? 0} links`}
                />
                <StatTile
                  label="Average score"
                  value={total ? Math.round(stats.avg_compliance_score ?? 0) : '–'}
                  sub="out of 100"
                />
                <StatTile label="Compliant" value={stats?.approved_count ?? 0} tone="ok" />
                <StatTile label="Needs review" value={stats?.needs_review_count ?? 0} tone="warn" />
                <StatTile label="Non-compliant" value={stats?.failed_count ?? 0} tone="bad" />
              </>
            )}
          </div>

          {data && (
            <div className="charts">
              <div className="card chart-card">
                <h3 className="card-title">Compliance trend</h3>
                <p className="card-sub">Average score per day, last 30 days</p>
                <TrendChart data={data.trend} colors={colors} animate={!reducedMotion} />
              </div>
              <div className="card chart-card">
                <h3 className="card-title">Violations by manufacturer</h3>
                <p className="card-sub">Top manufacturers by number of violations</p>
                <BrandChart data={data.brands} colors={colors} animate={!reducedMotion} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
