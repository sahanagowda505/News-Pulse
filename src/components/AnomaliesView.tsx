import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Info, RefreshCw, ShieldAlert } from 'lucide-react';
import type { DashboardPayload, HourlyStat } from '../types';
import { PlotlyChart } from './PlotlyChart';

interface AnomaliesViewProps {
  data: DashboardPayload;
  zThreshold: number;
  onChangeZThreshold: (z: number) => void;
  onRerunWithThreshold: () => void;
  isProcessing: boolean;
  initialSelectedHour?: string | null;
}

export function AnomaliesView({
  data,
  zThreshold,
  onChangeZThreshold,
  onRerunWithThreshold,
  isProcessing,
  initialSelectedHour,
}: AnomaliesViewProps) {
  const summary = data.summary;
  const [selectedHour, setSelectedHour] = useState<string | null>(
    initialSelectedHour || data.anomalies[0]?.event_hour || null
  );

  useEffect(() => {
    if (initialSelectedHour) {
      setSelectedHour(initialSelectedHour);
    } else if (data.anomalies.length > 0 && !data.anomalies.some((a) => a.event_hour === selectedHour)) {
      setSelectedHour(data.anomalies[0].event_hour);
    }
  }, [initialSelectedHour, data.anomalies, selectedHour]);

  const activeAlert: HourlyStat | null = useMemo(() => {
    if (!selectedHour) return data.anomalies[0] ?? null;
    return (
      data.anomalies.find((a) => a.event_hour === selectedHour) ||
      data.hourly.find((h) => h.event_hour === selectedHour) ||
      data.anomalies[0] ||
      null
    );
  }, [selectedHour, data.anomalies, data.hourly]);

  const relatedArticles = useMemo(() => {
    if (!activeAlert) return [];
    return data.articles.filter((a) => a.event_hour === activeAlert.event_hour).slice(0, 8);
  }, [activeAlert, data.articles]);

  if (!summary || data.hourly.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        Process a dataset first to inspect statistical anomaly metrics.
      </div>
    );
  }

  const normalPoints = data.hourly.filter((h) => h.is_anomaly !== 'true');
  const anomalyPoints = data.hourly.filter((h) => h.is_anomaly === 'true');

  return (
    <div className="space-y-6">
      {/* Statistical Formula & Baseline Strip */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-2">
          <div className="text-xs font-medium text-cyan-400">Statistical Formula</div>
          <div className="mt-2 font-mono-tabular text-lg font-bold text-white">
            Z = (X &minus; Mean) / StdDev
          </div>
          <p className="mt-1 text-xs text-slate-400">
            X = hourly volume · Mean (&mu;) = {summary.globalHourlyMean} · StdDev (&sigma;) = {summary.globalHourlyStddev}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="text-xs font-medium text-slate-400">Hourly Mean (&mu;)</div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-white">
            {summary.globalHourlyMean}
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            Range {summary.minHourlyVolume}–{summary.maxHourlyVolume} articles/hr
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="text-xs font-medium text-slate-400">Std Deviation (&sigma;)</div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-purple-300">
            {summary.globalHourlyStddev}
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            {summary.hourlyBuckets} hourly buckets analyzed
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="text-xs font-medium text-slate-400">Anomalies Detected</div>
          <div
            className={`mt-2 font-mono-tabular text-2xl font-bold ${
              data.anomalies.length > 0 ? 'text-rose-400' : 'text-emerald-400'
            }`}
          >
            {data.anomalies.length}
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            Threshold Z &ge; {summary.zThreshold}
          </div>
        </div>
      </div>

      {/* Safeguard Notices for Insufficient Data or Zero StdDev */}
      {(summary.insufficientData || summary.zeroStddev) && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/25 p-4 text-xs text-amber-200"
        >
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <strong className="text-amber-300">Statistical Safeguard Active: </strong>
            {summary.statusNote}
          </div>
        </div>
      )}

      {/* Configurable Z-Score Threshold Bar */}
      <section className="flex flex-col gap-4 rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 max-w-xl">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <label htmlFor="anomaly-z-slider" className="font-semibold text-slate-200">
              Configurable Anomaly Z-Score Threshold
            </label>
            <span className="font-mono-tabular font-bold text-cyan-400">
              Z &ge; {zThreshold.toFixed(1)}
            </span>
          </div>
          <input
            id="anomaly-z-slider"
            type="range"
            min="1.2"
            max="3.5"
            step="0.1"
            value={zThreshold}
            onChange={(e) => onChangeZThreshold(parseFloat(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Higher thresholds isolate only extreme statistical surges; lower thresholds capture moderate spikes.
          </p>
        </div>

        <button
          type="button"
          onClick={onRerunWithThreshold}
          disabled={isProcessing}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50 whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
          <span>{isProcessing ? 'Re-running Spark...' : 'Apply Threshold in Spark'}</span>
        </button>
      </section>

      {/* Normal vs Unusual Activity Volume Chart + Z-Score Chart */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                Normal vs. Unusual Hourly Activity
              </h2>
              <p className="text-xs text-slate-400">
                Click any marker to inspect statistical anomaly details
              </p>
            </div>
            <span className="text-xs text-rose-400">Red/Orange = Unusual Spike</span>
          </div>
          <PlotlyChart
            ariaLabel="Normal versus unusual hourly news volume with rolling baseline"
            height={340}
            onPointClick={(_, label) => {
              if (label) setSelectedHour(label);
            }}
            data={[
              {
                x: data.hourly.map((h) => h.event_hour),
                y: data.hourly.map((h) => Number(h.article_count)),
                type: 'scatter',
                mode: 'lines',
                name: 'Hourly Volume (X)',
                line: { color: '#22D3EE', width: 2.5 },
              },
              {
                x: data.hourly.map((h) => h.event_hour),
                y: data.hourly.map((h) => Number(h.rolling_avg)),
                type: 'scatter',
                mode: 'lines',
                name: '6h Rolling Baseline',
                line: { color: '#A855F7', width: 2, dash: 'dash' },
              },
              {
                x: normalPoints.map((h) => h.event_hour),
                y: normalPoints.map((h) => Number(h.article_count)),
                type: 'scatter',
                mode: 'markers',
                name: 'Normal Activity',
                marker: { color: '#10B981', size: 6 },
              },
              ...(anomalyPoints.length
                ? [
                    {
                      x: anomalyPoints.map((h) => h.event_hour),
                      y: anomalyPoints.map((h) => Number(h.article_count)),
                      text: anomalyPoints.map(
                        (h) => `${h.severity} | Z=${h.z_score} | ${h.dominant_category}`
                      ),
                      type: 'scatter',
                      mode: 'markers',
                      name: 'Anomaly Marker',
                      marker: {
                        color: anomalyPoints.map((h) =>
                          h.severity === 'MEDIUM' ? '#F97316' : '#EF4444'
                        ),
                        size: 13,
                        symbol: 'diamond',
                        line: { color: '#FFFFFF', width: 1.5 },
                      },
                    },
                  ]
                : []),
            ]}
            layout={{
              legend: { orientation: 'h', y: 1.15, x: 0 },
              margin: { l: 48, r: 16, t: 38, b: 48 },
            }}
          />
        </section>

        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-5">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-semibold text-white">Hourly Z-Score Distribution</h2>
            <span className="font-mono-tabular text-xs text-orange-400">
              Cutoff Z = {summary.zThreshold}
            </span>
          </div>
          <PlotlyChart
            ariaLabel="Hourly Z-score bar chart with threshold line"
            height={340}
            onPointClick={(_, label) => {
              if (label) setSelectedHour(label);
            }}
            data={[
              {
                x: data.hourly.map((h) => h.event_hour),
                y: data.hourly.map((h) => Number(h.z_score)),
                type: 'bar',
                name: 'Z-Score',
                marker: {
                  color: data.hourly.map((h) =>
                    h.is_anomaly === 'true'
                      ? h.severity === 'MEDIUM'
                        ? '#F97316'
                        : '#EF4444'
                      : '#334155'
                  ),
                },
              },
            ]}
            layout={{
              shapes: [
                {
                  type: 'line',
                  xref: 'paper',
                  x0: 0,
                  x1: 1,
                  y0: summary.zThreshold,
                  y1: summary.zThreshold,
                  line: { color: '#F97316', width: 1.8, dash: 'dash' },
                },
              ],
              margin: { l: 48, r: 16, t: 24, b: 48 },
            }}
          />
        </section>
      </div>

      {/* Alert Details Panel + Anomaly History */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Alert Details Panel */}
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-400" />
              <h2 className="text-base font-semibold text-white">Alert Details Panel</h2>
            </div>
            {activeAlert && (
              <span
                className={`font-mono-tabular text-xs font-bold ${
                  activeAlert.is_anomaly === 'true'
                    ? activeAlert.severity === 'MEDIUM'
                      ? 'text-orange-400'
                      : 'text-rose-400'
                    : 'text-emerald-400'
                }`}
              >
                {activeAlert.severity}
              </span>
            )}
          </div>

          {!activeAlert ? (
            <p className="text-xs text-slate-400">
              Select an hour from the chart or anomaly history to inspect statistical details.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Timestamp (UTC)</div>
                  <div className="mt-1 font-mono-tabular text-xs font-semibold text-white">
                    {activeAlert.event_hour}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Volume (X)</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-cyan-300">
                    {activeAlert.article_count} articles
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Calculated Z-Score</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-rose-400">
                    {activeAlert.z_score}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">6h Rolling Avg</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-purple-300">
                    {activeAlert.rolling_avg} ({activeAlert.spike_ratio}x)
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4 space-y-2">
                <div className="text-xs font-semibold text-slate-200">
                  Why This Window Was Flagged
                </div>
                <p className="text-xs leading-relaxed text-slate-300">
                  {activeAlert.alert_explanation || activeAlert.alert_message}
                </p>
                <div className="pt-1 text-xs text-slate-400">
                  <strong className="text-slate-200">Dominant Category:</strong> {activeAlert.dominant_category} ·{' '}
                  <strong className="text-slate-200">Related Keywords:</strong> {activeAlert.top_keywords}
                </div>
              </div>

              {relatedArticles.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Sample Headlines During {activeAlert.event_hour} UTC
                  </div>
                  <ul className="space-y-1.5 text-xs text-slate-300">
                    {relatedArticles.map((art, idx) => (
                      <li
                        key={`${art.url}-${idx}`}
                        className="rounded-md border border-slate-800/70 bg-slate-950/50 px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{art.title}</span>
                        <span className="shrink-0 text-[11px] text-cyan-400">{art.category}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-800/80 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-400">
            <strong className="text-slate-300">Statistical Scope Note:</strong> Anomaly detection strictly measures unusual changes in news publication volume relative to baseline activity. It does not claim whether an event is real or verify whether news coverage is accurate or fake.
          </div>
        </section>

        {/* Anomaly History List */}
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" />
              <h2 className="text-base font-semibold text-white">Anomaly History</h2>
            </div>
            <span className="font-mono-tabular text-xs text-slate-400">
              {data.anomalies.length} alerts
            </span>
          </div>

          {data.anomalies.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">
              No hourly windows exceeded the current Z-score threshold ({summary.zThreshold}). Try lowering the threshold above or loading a surge dataset.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[430px] overflow-y-auto pr-1">
              {data.anomalies.map((alert) => {
                const isSelected = activeAlert?.event_hour === alert.event_hour;
                const isSevere = alert.severity === 'CRITICAL' || alert.severity === 'HIGH';
                return (
                  <button
                    key={alert.event_hour}
                    type="button"
                    onClick={() => setSelectedHour(alert.event_hour)}
                    className={`w-full text-left rounded-lg border p-3.5 transition-all ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/25'
                        : isSevere
                          ? 'border-rose-500/35 bg-rose-950/15 hover:border-rose-400/60'
                          : 'border-orange-500/35 bg-orange-950/15 hover:border-orange-400/60'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-white">
                        <span className={isSevere ? 'text-rose-400' : 'text-orange-400'}>
                          {alert.severity}
                        </span>
                        <span className="mx-2 text-slate-600">·</span>
                        <span className="font-mono-tabular">{alert.event_hour} UTC</span>
                      </span>
                      <span className="font-mono-tabular text-slate-200">
                        Z={alert.z_score} · {alert.article_count} articles
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-300">{alert.alert_message}</p>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Category: {alert.dominant_category} · Terms: {alert.top_keywords}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
