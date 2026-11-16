import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Info,
  RefreshCw,
  SearchCode,
  Tag,
  TrendingUp,
} from 'lucide-react';
import type { DashboardPayload, NewsSpike } from '../types';
import { PlotlyChart } from './PlotlyChart';

interface NewsSpikeDetectiveViewProps {
  data: DashboardPayload;
  zThreshold: number;
  onChangeZThreshold: (z: number) => void;
  onRerunWithThreshold: () => void;
  isProcessing: boolean;
  initialSelectedHour?: string | null;
}

const SEVERITY_STYLES: Record<string, { badge: string; border: string; bg: string; marker: string }> = {
  Critical: {
    badge: 'text-rose-400',
    border: 'border-rose-500/45',
    bg: 'bg-rose-950/20',
    marker: '#FB7185',
  },
  High: {
    badge: 'text-orange-400',
    border: 'border-orange-500/45',
    bg: 'bg-orange-950/20',
    marker: '#F97316',
  },
  Moderate: {
    badge: 'text-amber-300',
    border: 'border-amber-500/40',
    bg: 'bg-amber-950/20',
    marker: '#FACC15',
  },
};

export function NewsSpikeDetectiveView({
  data,
  zThreshold,
  onChangeZThreshold,
  onRerunWithThreshold,
  isProcessing,
  initialSelectedHour,
}: NewsSpikeDetectiveViewProps) {
  const summary = data.summary;
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [minPctIncrease, setMinPctIncrease] = useState<number>(0);
  const [selectedHour, setSelectedHour] = useState<string | null>(
    initialSelectedHour || data.newsSpikes[0]?.event_hour || null
  );

  const spikeCategories = useMemo(() => {
    const set = new Set(data.newsSpikes.map((s) => s.responsible_category).filter(Boolean));
    return Array.from(set).sort();
  }, [data.newsSpikes]);

  const filteredSpikes = useMemo(() => {
    return data.newsSpikes.filter((sp) => {
      if (severityFilter !== 'All' && sp.spike_severity !== severityFilter) return false;
      if (categoryFilter !== 'All' && sp.responsible_category !== categoryFilter) return false;
      if (Number(sp.pct_increase) < minPctIncrease) return false;
      return true;
    });
  }, [data.newsSpikes, severityFilter, categoryFilter, minPctIncrease]);

  useEffect(() => {
    if (initialSelectedHour && data.newsSpikes.some((s) => s.event_hour === initialSelectedHour)) {
      setSelectedHour(initialSelectedHour);
      return;
    }
    if (filteredSpikes.length > 0 && !filteredSpikes.some((s) => s.event_hour === selectedHour)) {
      setSelectedHour(filteredSpikes[0].event_hour);
    } else if (filteredSpikes.length === 0) {
      setSelectedHour(null);
    }
  }, [initialSelectedHour, data.newsSpikes, filteredSpikes, selectedHour]);

  const activeSpike: NewsSpike | null = useMemo(() => {
    if (!selectedHour) return filteredSpikes[0] ?? null;
    return filteredSpikes.find((s) => s.event_hour === selectedHour) ?? filteredSpikes[0] ?? null;
  }, [selectedHour, filteredSpikes]);

  const activeKeywords = useMemo(() => {
    if (!activeSpike?.responsible_keywords) return [];
    return activeSpike.responsible_keywords
      .split(',')
      .map((k) => k.trim())
      .filter((k) => k && k.toLowerCase() !== 'none');
  }, [activeSpike]);

  const relatedArticles = useMemo(() => {
    if (!activeSpike) return [];
    const hourMatches = data.articles.filter((a) => a.event_hour === activeSpike.event_hour);
    if (activeKeywords.length === 0) return hourMatches;
    // Prioritize articles whose headline/description matches leading spike keywords
    return [...hourMatches].sort((a, b) => {
      const aText = `${a.title} ${a.description}`.toLowerCase();
      const bText = `${b.title} ${b.description}`.toLowerCase();
      const aHits = activeKeywords.filter((kw) => aText.includes(kw.toLowerCase())).length;
      const bHits = activeKeywords.filter((kw) => bText.includes(kw.toLowerCase())).length;
      return bHits - aHits;
    });
  }, [activeSpike, data.articles, activeKeywords]);

  if (!summary || data.hourly.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        Process a dataset first to activate News Spike Detective.
      </div>
    );
  }

  const maxPctIncrease = data.newsSpikes.reduce(
    (max, sp) => Math.max(max, Number(sp.pct_increase) || 0),
    0
  );

  const moderateCutoff = Math.max(1.15, zThreshold - 0.5);

  return (
    <div className="space-y-6">
      {/* Top KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-rose-500/80 to-orange-500/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Detected News Spikes</span>
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-white">
            {data.newsSpikes.length}
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            {filteredSpikes.length} matching active filters
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-purple-400/80 to-cyan-400/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Highest Spike Category</span>
            <Tag className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white truncate">
            {summary.highestSpikeCategory && summary.highestSpikeCategory !== 'None'
              ? summary.highestSpikeCategory
              : 'None'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Primary driver of peak hourly surge
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-400/80 to-rose-500/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Peak Volume Surge</span>
            <TrendingUp className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-amber-300">
            {data.newsSpikes.length > 0 ? `+${maxPctIncrease.toFixed(1)}%` : '0.0%'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Increase over prior 6h rolling average
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400/80 to-emerald-400/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Hourly Baseline (&mu; &plusmn; &sigma;)</span>
            <Activity className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-cyan-300">
            {summary.globalHourlyMean} &plusmn; {summary.globalHourlyStddev}
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            {summary.hourlyBuckets} hourly windows evaluated
          </div>
        </div>
      </div>

      {/* Safeguard Notices */}
      {(summary.insufficientData || summary.zeroStddev) && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/25 p-4 text-xs text-amber-200"
        >
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <strong className="text-amber-300">Insufficient Baseline Safeguard: </strong>
            {summary.statusNote}
          </div>
        </div>
      )}

      {/* Configurable Severity Thresholds & Filters */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex-1 max-w-xl">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="spike-z-slider" className="font-semibold text-slate-200">
                Spark Spike Sensitivity (High &ge; Z, Critical &ge; Z+1.0, Moderate &ge;{' '}
                {moderateCutoff.toFixed(2)})
              </label>
              <span className="font-mono-tabular font-bold text-cyan-400">
                Z &ge; {zThreshold.toFixed(1)}
              </span>
            </div>
            <input
              id="spike-z-slider"
              type="range"
              min="1.2"
              max="3.5"
              step="0.1"
              value={zThreshold}
              onChange={(e) => onChangeZThreshold(parseFloat(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          <button
            type="button"
            onClick={onRerunWithThreshold}
            disabled={isProcessing}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isProcessing ? 'animate-spin' : ''}`} />
            <span>{isProcessing ? 'Recalculating in Spark...' : 'Recalculate Spikes in Spark'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-3 border-t border-slate-800/80 sm:grid-cols-3">
          <div>
            <label htmlFor="spike-severity-filter" className="block text-[11px] font-medium text-slate-400 mb-1">
              Severity Level
            </label>
            <select
              id="spike-severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Severities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Moderate">Moderate</option>
            </select>
          </div>

          <div>
            <label htmlFor="spike-category-filter" className="block text-[11px] font-medium text-slate-400 mb-1">
              Responsible Category
            </label>
            <select
              id="spike-category-filter"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Categories</option>
              {spikeCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-400 mb-1">
              <label htmlFor="spike-min-pct">Min % Increase Filter</label>
              <span className="font-mono-tabular text-amber-300">+{minPctIncrease}%</span>
            </div>
            <input
              id="spike-min-pct"
              type="range"
              min="0"
              max="300"
              step="25"
              value={minPctIncrease}
              onChange={(e) => setMinPctIncrease(Number(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* Hourly Volume vs. Baseline with Spike Severity Markers */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <div>
            <h2 className="text-base font-semibold text-white">
              Hourly Volume Surge Timeline
            </h2>
            <p className="text-xs text-slate-400">
              Click any highlighted spike marker to inspect responsible topics and linked articles
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-rose-400 font-medium">Critical</span>
            <span className="text-orange-400 font-medium">High</span>
            <span className="text-amber-300 font-medium">Moderate</span>
          </div>
        </div>

        <PlotlyChart
          ariaLabel="Hourly news volume compared against rolling average with severity spike markers"
          height={330}
          onPointClick={(_, label) => {
            if (filteredSpikes.some((sp) => sp.event_hour === label)) {
              setSelectedHour(label);
            }
          }}
          data={[
            {
              x: data.hourly.map((h) => h.event_hour),
              y: data.hourly.map((h) => Number(h.article_count)),
              type: 'scatter',
              mode: 'lines',
              name: 'Current Hourly Volume',
              line: { color: '#22D3EE', width: 2.5, shape: 'spline' },
              fill: 'tozeroy',
              fillcolor: 'rgba(34, 211, 238, 0.08)',
            },
            {
              x: data.hourly.map((h) => h.event_hour),
              y: data.hourly.map((h) => Number(h.rolling_avg)),
              type: 'scatter',
              mode: 'lines',
              name: 'Previous Rolling Avg',
              line: { color: '#A855F7', width: 2, dash: 'dash' },
            },
            ...(filteredSpikes.length > 0
              ? [
                  {
                    x: filteredSpikes.map((sp) => sp.event_hour),
                    y: filteredSpikes.map((sp) => Number(sp.current_volume)),
                    text: filteredSpikes.map(
                      (sp) =>
                        `${sp.spike_severity} | +${sp.pct_increase}% (${sp.previous_avg} → ${sp.current_volume}) | ${sp.responsible_category}`
                    ),
                    type: 'scatter',
                    mode: 'markers',
                    name: 'Detected Spike',
                    marker: {
                      color: filteredSpikes.map(
                        (sp) => SEVERITY_STYLES[sp.spike_severity]?.marker ?? '#FB7185'
                      ),
                      size: 14,
                      symbol: 'diamond',
                      line: { color: '#FFFFFF', width: 1.5 },
                    },
                  },
                ]
              : []),
          ]}
          layout={{
            legend: { orientation: 'h', y: 1.14, x: 0 },
            margin: { l: 48, r: 16, t: 36, b: 48 },
          }}
        />
      </section>

      {/* Interactive Spike Alerts + 5-Question Investigation Panel */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Left: Interactive Spike Alerts */}
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400" />
              <h2 className="text-base font-semibold text-white">Interactive Spike Alerts</h2>
            </div>
            <span className="font-mono-tabular text-xs text-slate-400">
              {filteredSpikes.length} alerts
            </span>
          </div>

          {filteredSpikes.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center text-xs text-slate-400">
              <p>No spikes match the active filters or Z-score threshold ({summary.zThreshold}).</p>
              <p className="mt-1 text-slate-500">
                Try lowering the Z-score threshold above or clearing the severity/category filters.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {filteredSpikes.map((sp) => {
                const isSelected = activeSpike?.event_hour === sp.event_hour;
                const style = SEVERITY_STYLES[sp.spike_severity] ?? SEVERITY_STYLES.Moderate;
                return (
                  <button
                    key={sp.event_hour}
                    type="button"
                    onClick={() => setSelectedHour(sp.event_hour)}
                    className={`w-full text-left rounded-xl border p-4 transition-all ${
                      isSelected
                        ? 'border-cyan-400 bg-cyan-950/25 shadow-md shadow-cyan-500/10'
                        : `${style.border} ${style.bg} hover:brightness-110`
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className={`font-bold ${style.badge}`}>
                        {sp.spike_severity} · {sp.responsible_category}
                      </span>
                      <span className="font-mono-tabular font-semibold text-emerald-300">
                        +{sp.pct_increase}%
                      </span>
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 font-mono-tabular text-xs text-slate-200">
                      <span>
                        {sp.spike_date} · {sp.spike_time}
                      </span>
                      <span className="text-slate-400">Z={sp.z_score}</span>
                    </div>

                    <div className="mt-1.5 font-mono-tabular text-xs text-slate-300">
                      Avg {sp.previous_avg} &rarr; <strong className="text-white">{sp.current_volume} articles</strong>
                    </div>

                    <div className="mt-1.5 text-[11px] text-slate-400 truncate">
                      Keywords: {sp.responsible_keywords}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Spike Detective Investigation Panel */}
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SearchCode className="h-4 w-4 text-cyan-400" />
              <h2 className="text-base font-semibold text-white">
                Spike Investigation Report
              </h2>
            </div>
            {activeSpike && (
              <span
                className={`font-mono-tabular text-xs font-bold ${
                  SEVERITY_STYLES[activeSpike.spike_severity]?.badge ?? 'text-amber-300'
                }`}
              >
                {activeSpike.spike_severity} Severity
              </span>
            )}
          </div>

          {!activeSpike ? (
            <div className="py-16 text-center text-xs text-slate-400">
              Select a spike alert on the left or click a diamond marker on the chart to inspect associated topics and articles.
            </div>
          ) : (
            <>
              {/* Metrics Grid answering When, How Much, Category */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <CalendarClock className="h-3 w-3 text-cyan-400" />
                    <span>Spike Date &amp; Time</span>
                  </div>
                  <div className="mt-1 font-mono-tabular text-xs font-semibold text-white">
                    {activeSpike.spike_date}
                  </div>
                  <div className="font-mono-tabular text-[11px] text-slate-400">
                    {activeSpike.spike_time}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Previous Avg vs Current</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-cyan-300">
                    {activeSpike.previous_avg} &rarr; {activeSpike.current_volume}
                  </div>
                  <div className="text-[11px] text-slate-400">articles/hour</div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Percentage Growth</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-emerald-400">
                    +{activeSpike.pct_increase}%
                  </div>
                  <div className="font-mono-tabular text-[11px] text-slate-400">
                    Z-score: {activeSpike.z_score}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Responsible Category</div>
                  <div className="mt-1 text-sm font-bold text-purple-300 truncate">
                    {activeSpike.responsible_category}
                  </div>
                  <div className="text-[11px] text-slate-400">Dominant domain</div>
                </div>
              </div>

              {/* Narrative Answer & Responsible Keywords */}
              <div className="rounded-lg border border-slate-800 bg-[#070B14] p-4 space-y-3">
                <div className="text-xs font-semibold text-white">
                  What Happened &amp; Which Topics Caused It
                </div>
                <p className="text-xs leading-relaxed text-slate-300">
                  {activeSpike.spike_summary}
                </p>
                {activeKeywords.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] font-medium text-slate-400">
                      Leading Spike Keywords:
                    </span>
                    {activeKeywords.map((kw) => (
                      <span
                        key={kw}
                        className="rounded-md border border-cyan-500/30 bg-cyan-950/30 px-2 py-0.5 text-[11px] font-medium text-cyan-200"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Associated Articles */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-semibold text-slate-200">
                    Associated News Articles ({relatedArticles.length} published in {activeSpike.event_hour} UTC)
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    Sorted by keyword relevance
                  </span>
                </div>

                {relatedArticles.length === 0 ? (
                  <p className="rounded-lg border border-slate-800 bg-[#070B14] p-4 text-xs text-slate-400">
                    No individual article records matched this timestamp.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {relatedArticles.map((art, idx) => (
                      <div
                        key={`${art.url}-${idx}`}
                        className="rounded-lg border border-slate-800/80 bg-[#070B14] px-3.5 py-2.5 hover:border-slate-700 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-100 leading-snug">
                              {art.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                              <span className="text-purple-300 font-medium">{art.category}</span>
                              <span>·</span>
                              <span>{art.source} ({art.country})</span>
                              <span>·</span>
                              <span className="font-mono-tabular">Tone {Number(art.tone).toFixed(2)}</span>
                            </div>
                          </div>
                          {art.url && (
                            <a
                              href={art.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-cyan-400 hover:border-cyan-400"
                              aria-label={`Open article ${art.title}`}
                            >
                              <span>Source</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
