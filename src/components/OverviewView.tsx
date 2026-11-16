import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CopyCheck,
  Database,
  ExternalLink,
  FilterX,
  Flame,
  Globe2,
  Newspaper,
  Radar,
  Search,
  Sparkles,
  Tag,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { DashboardPayload } from '../types';
import { useCountUp } from '../hooks/useCountUp';
import { PlotlyChart } from './PlotlyChart';

interface OverviewViewProps {
  data: DashboardPayload;
  onNavigateIngest: () => void;
  onInspectAnomaly: (eventHour: string) => void;
  onNavigateSpikes?: () => void;
  onNavigateExplosions?: () => void;
}

const PALETTE = [
  '#22D3EE', // Cyan
  '#A855F7', // Purple
  '#10B981', // Emerald
  '#F97316', // Orange
  '#FB7185', // Coral
  '#38BDF8', // Sky
  '#FACC15', // Amber
  '#818CF8', // Indigo
];

export function OverviewView({
  data,
  onNavigateIngest,
  onInspectAnomaly,
  onNavigateSpikes,
  onNavigateExplosions,
}: OverviewViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [countryFilter, setCountryFilter] = useState('All');

  const summary = data.summary;

  const animRaw = useCountUp(summary?.rawCount ?? 0);
  const animCleaned = useCountUp(summary?.cleanedCount ?? 0);
  const animDupes = useCountUp(summary?.duplicatesRemoved ?? 0);
  const animInvalid = useCountUp(summary?.invalidDropped ?? 0);
  const animCountries = useCountUp(summary?.distinctCountries ?? 0);
  const animSources = useCountUp(summary?.distinctSources ?? 0);
  const animAnomalies = useCountUp(summary?.anomalyCount ?? 0);
  const animSpikes = useCountUp(summary?.totalNewsSpikes ?? data.newsSpikes.length);
  const animExplosions = useCountUp(summary?.rapidlyGrowingTopics ?? data.topicExplosions.length);

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return data.articles.filter((art) => {
      if (categoryFilter !== 'All' && art.category !== categoryFilter) return false;
      if (countryFilter !== 'All' && art.country !== countryFilter) return false;
      if (!q) return true;
      return (
        art.title.toLowerCase().includes(q) ||
        art.description.toLowerCase().includes(q) ||
        art.source.toLowerCase().includes(q)
      );
    });
  }, [data.articles, searchQuery, categoryFilter, countryFilter]);

  if (!summary || data.articles.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 backdrop-blur-md p-12 text-center">
        <h2 className="text-lg font-semibold text-slate-100">No Processed Spark Output Loaded</h2>
        <p className="mt-2 text-sm text-slate-400">
          Upload a CSV dataset or run a sample dataset to initialize the Scala &amp; Apache Spark pipeline.
        </p>
        <button
          type="button"
          onClick={onNavigateIngest}
          className="mt-5 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:brightness-110"
        >
          Open Data Ingestion &amp; Spark
        </button>
      </div>
    );
  }

  const hourlyTrace = {
    x: data.hourly.map((h) => h.event_hour),
    y: data.hourly.map((h) => Number(h.article_count)),
    type: 'scatter',
    mode: 'lines+markers',
    name: 'Hourly Volume (X)',
    line: { color: '#22D3EE', width: 2.5, shape: 'spline' },
    marker: { size: 5, color: '#22D3EE' },
    fill: 'tozeroy',
    fillcolor: 'rgba(34, 211, 238, 0.08)',
  };

  const rollingTrace = {
    x: data.hourly.map((h) => h.event_hour),
    y: data.hourly.map((h) => Number(h.rolling_avg)),
    type: 'scatter',
    mode: 'lines',
    name: '6h Rolling Avg',
    line: { color: '#A855F7', width: 2, dash: 'dash' },
  };

  const anomalyHours = data.hourly.filter((h) => h.is_anomaly === 'true');
  const anomalyTrace = {
    x: anomalyHours.map((h) => h.event_hour),
    y: anomalyHours.map((h) => Number(h.article_count)),
    text: anomalyHours.map(
      (h) => `${h.severity}: ${h.article_count} articles · Z=${h.z_score} (${h.dominant_category})`
    ),
    type: 'scatter',
    mode: 'markers',
    name: 'Anomaly Marker',
    marker: {
      color: anomalyHours.map((h) => (h.severity === 'MEDIUM' ? '#F97316' : '#FB7185')),
      size: 13,
      symbol: 'diamond',
      line: { color: '#FFFFFF', width: 1.5 },
    },
  };

  const categoryDonutTrace = {
    labels: data.categories.map((c) => c.category),
    values: data.categories.map((c) => Number(c.article_count)),
    type: 'pie',
    hole: 0.58,
    textinfo: 'label+percent',
    textposition: 'outside',
    marker: {
      colors: PALETTE,
      line: { color: '#0B1120', width: 2 },
    },
    hovertemplate: '<b>%{label}</b><br>Articles: %{value}<br>Share: %{percent}<extra></extra>',
  };

  const topTopics = data.topics.slice(0, 10);
  const topicsTrace = {
    x: topTopics.map((t) => Number(t.mentions)),
    y: topTopics.map((t) => t.topic),
    type: 'bar',
    orientation: 'h',
    marker: {
      color: topTopics.map((_, idx) => PALETTE[idx % PALETTE.length]),
    },
    text: topTopics.map((t) => `${t.mentions} · ${t.primary_category}`),
    textposition: 'outside',
  };

  const topCountries = data.countries.slice(0, 10);
  const countryTrace = {
    x: topCountries.map((c) => c.country),
    y: topCountries.map((c) => Number(c.article_count)),
    type: 'bar',
    marker: {
      color: topCountries.map((_, idx) => PALETTE[(idx + 1) % PALETTE.length]),
    },
    text: topCountries.map((c) => c.top_category),
    textposition: 'outside',
  };

  const kpiCards = [
    {
      label: 'Total Articles Processed',
      value: animRaw.toLocaleString(),
      sub: 'Raw CSV rows ingested',
      icon: Database,
      accent: 'from-cyan-400/80 to-sky-500/80',
      iconColor: 'text-cyan-400',
    },
    {
      label: 'Cleaned Articles',
      value: animCleaned.toLocaleString(),
      sub: 'Validated & categorized',
      icon: Sparkles,
      accent: 'from-emerald-400/80 to-teal-500/80',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Duplicates Removed',
      value: animDupes.toLocaleString(),
      sub: 'Deduplicated by URL & title',
      icon: CopyCheck,
      accent: 'from-purple-400/80 to-indigo-500/80',
      iconColor: 'text-purple-400',
    },
    {
      label: 'Invalid Records Dropped',
      value: animInvalid.toLocaleString(),
      sub: 'Missing title or bad date',
      icon: FilterX,
      accent: 'from-orange-400/80 to-amber-500/80',
      iconColor: 'text-orange-400',
    },
    {
      label: 'Total Countries',
      value: animCountries.toLocaleString(),
      sub: 'Normalized country codes',
      icon: Globe2,
      accent: 'from-sky-400/80 to-cyan-500/80',
      iconColor: 'text-sky-400',
    },
    {
      label: 'News Sources',
      value: animSources.toLocaleString(),
      sub: 'Distinct publishers tracked',
      icon: Newspaper,
      accent: 'from-indigo-400/80 to-purple-500/80',
      iconColor: 'text-indigo-400',
    },
    {
      label: 'Top Trending Topic',
      value: summary.topTopic ? summary.topTopic.charAt(0).toUpperCase() + summary.topTopic.slice(1) : 'N/A',
      sub: `Leader in ${summary.topCategory}`,
      icon: Flame,
      accent: 'from-amber-400/80 to-orange-500/80',
      iconColor: 'text-amber-400',
    },
    {
      label: 'Total Anomaly Alerts',
      value: animAnomalies.toLocaleString(),
      sub: `Z-score >= ${summary.zThreshold}`,
      icon: AlertTriangle,
      accent: summary.anomalyCount > 0 ? 'from-rose-500/80 to-coral-500/80' : 'from-emerald-400/80 to-teal-500/80',
      iconColor: summary.anomalyCount > 0 ? 'text-rose-400' : 'text-emerald-400',
    },
  ];

  return (
    <div className="space-y-6">
      {summary.isSampleData && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-950/20 px-4 py-2.5 text-xs text-amber-200">
          <span>
            <strong className="text-amber-300">Sample Dataset Active:</strong> Displaying real Apache Spark output for <code className="font-mono-tabular text-amber-100">{summary.datasetName || 'sample_global_news.csv'}</code>. Upload your own CSV or fetch live news in Data Ingestion &amp; Spark.
          </span>
          <button
            type="button"
            onClick={onNavigateIngest}
            className="font-semibold text-amber-300 underline hover:text-amber-200 whitespace-nowrap"
          >
            Upload Custom CSV
          </button>
        </div>
      )}

      {/* 8 KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="group relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 transition-all duration-200 hover:border-slate-700 hover:bg-slate-900/90"
            >
              <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${card.accent}`} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-400">{card.label}</span>
                <Icon className={`h-4 w-4 shrink-0 ${card.iconColor}`} />
              </div>
              <div className="mt-2.5 font-mono-tabular text-2xl font-bold text-white truncate">
                {card.value}
              </div>
              <div className="mt-1 text-xs text-slate-400 truncate">{card.sub}</div>
            </div>
          );
        })}
      </div>

      {/* 4 Spike Detective & Topic Explosion KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Total News Spikes',
            value: animSpikes.toLocaleString(),
            sub: 'Moderate, High & Critical volume surges',
            icon: Radar,
            accent: 'from-amber-400/80 to-rose-500/80',
            iconColor: 'text-amber-400',
            onClick: onNavigateSpikes,
          },
          {
            label: 'Rapidly Growing Topics',
            value: animExplosions.toLocaleString(),
            sub: 'Keywords accelerating vs prior window',
            icon: TrendingUp,
            accent: 'from-emerald-400/80 to-cyan-500/80',
            iconColor: 'text-emerald-400',
            onClick: onNavigateExplosions,
          },
          {
            label: 'Highest Spike Category',
            value:
              summary.highestSpikeCategory && summary.highestSpikeCategory !== 'None'
                ? summary.highestSpikeCategory
                : 'None',
            sub: 'Dominant driver during peak surge',
            icon: Tag,
            accent: 'from-purple-400/80 to-rose-400/80',
            iconColor: 'text-purple-400',
            onClick: onNavigateSpikes,
          },
          {
            label: 'Most Explosive Topic',
            value:
              summary.mostExplosiveTopic && summary.mostExplosiveTopic !== 'None'
                ? summary.mostExplosiveTopic.charAt(0).toUpperCase() +
                  summary.mostExplosiveTopic.slice(1)
                : 'None',
            sub: 'Fastest keyword momentum in Spark',
            icon: Zap,
            accent: 'from-cyan-400/80 to-indigo-500/80',
            iconColor: 'text-cyan-400',
            onClick: onNavigateExplosions,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={card.onClick}
              className="group relative text-left overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 transition-all duration-200 hover:border-cyan-500/45 hover:bg-slate-900/90"
            >
              <div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${card.accent}`} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-400">{card.label}</span>
                <Icon className={`h-4 w-4 shrink-0 ${card.iconColor}`} />
              </div>
              <div className="mt-2.5 font-mono-tabular text-2xl font-bold text-white truncate">
                {card.value}
              </div>
              <div className="mt-1 text-xs text-slate-400 truncate">{card.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Hourly Volume + Category Donut */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                Hourly News Volume &amp; Statistical Anomalies
              </h2>
              <p className="text-xs text-slate-400">
                Observed volume vs. 6-hour rolling baseline · Mean {summary.globalHourlyMean}/hr · StdDev {summary.globalHourlyStddev}
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-cyan-400">
              {data.hourly.length} hourly windows
            </span>
          </div>
          <PlotlyChart
            ariaLabel="Hourly news volume, 6h rolling average, and statistical anomaly markers"
            height={340}
            data={[hourlyTrace, rollingTrace, ...(anomalyHours.length ? [anomalyTrace] : [])]}
            onPointClick={(_, label) => {
              if (anomalyHours.some((a) => a.event_hour === label)) {
                onInspectAnomaly(label);
              }
            }}
            layout={{
              legend: { orientation: 'h', y: 1.14, x: 0 },
              margin: { l: 48, r: 16, t: 36, b: 48 },
            }}
          />
        </section>

        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                Category Distribution
              </h2>
              <p className="text-xs text-slate-400">Classified by Scala Spark UDF</p>
            </div>
            <span className="text-xs text-purple-300">{data.categories.length} categories</span>
          </div>
          <PlotlyChart
            ariaLabel="Category distribution donut chart"
            height={340}
            data={[categoryDonutTrace]}
            layout={{
              showlegend: false,
              margin: { l: 24, r: 24, t: 24, b: 24 },
            }}
          />
        </section>
      </div>

      {/* Top Trending Topics + Country Coverage + Recent Anomaly Alerts */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-semibold text-white">Top Trending Topics</h2>
            <span className="text-xs text-emerald-400">Spark SQL</span>
          </div>
          <PlotlyChart
            ariaLabel="Top trending keywords bar chart"
            height={320}
            data={[topicsTrace]}
            layout={{
              yaxis: {
                autorange: 'reversed',
                gridcolor: 'rgba(30,41,59,0.7)',
                tickfont: { color: '#CBD5E1', size: 11 },
              },
              margin: { l: 96, r: 80, t: 16, b: 36 },
            }}
          />
        </section>

        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-4">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-base font-semibold text-white">Country-Wise Coverage</h2>
            <span className="text-xs text-cyan-400">Top 10 regions</span>
          </div>
          <PlotlyChart
            ariaLabel="Country-wise news coverage chart"
            height={320}
            data={[countryTrace]}
            layout={{
              margin: { l: 42, r: 16, t: 24, b: 44 },
            }}
          />
        </section>

        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-4 flex flex-col">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-white">Recent Anomaly Alerts</h2>
            <span className="font-mono-tabular text-xs text-rose-400">
              {data.anomalies.length} detected
            </span>
          </div>

          {data.anomalies.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 text-xs text-slate-400">
              <p>No statistical volume spikes exceeded Z &ge; {summary.zThreshold}.</p>
              {summary.statusNote && <p className="mt-1 text-slate-500">{summary.statusNote}</p>}
            </div>
          ) : (
            <div className="space-y-3 flex-1 overflow-y-auto pr-1">
              {data.anomalies.slice(0, 4).map((alert) => {
                const isSevere = alert.severity === 'CRITICAL' || alert.severity === 'HIGH';
                return (
                  <button
                    key={alert.event_hour}
                    type="button"
                    onClick={() => onInspectAnomaly(alert.event_hour)}
                    className={`w-full text-left rounded-lg border p-3.5 transition-all hover:brightness-110 ${
                      isSevere
                        ? 'border-rose-500/40 bg-rose-950/25'
                        : 'border-orange-500/40 bg-orange-950/25'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                      <span className={isSevere ? 'text-rose-400' : 'text-orange-400'}>
                        {alert.severity} · {alert.dominant_category}
                      </span>
                      <span className="font-mono-tabular text-slate-300">
                        Z={alert.z_score}
                      </span>
                    </div>
                    <div className="mt-1 font-mono-tabular text-[11px] text-slate-300">
                      {alert.event_hour} UTC · {alert.article_count} articles ({alert.spike_ratio}x baseline)
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 truncate">
                      Terms: {alert.top_keywords}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Searchable Cleaned Articles Explorer */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold text-white">
              Processed News Feed Explorer
            </h2>
            <p className="text-xs text-slate-400 tabular-nums">
              Showing {Math.min(filteredArticles.length, 35)} of {filteredArticles.length} Spark-cleaned articles
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter headlines or sources..."
                className="w-56 rounded-lg border border-slate-700/80 bg-[#070B14] py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-700/80 bg-[#070B14] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Categories</option>
              {data.categories.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by country"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="rounded-lg border border-slate-700/80 bg-[#070B14] px-2.5 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Countries</option>
              {data.countries.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 pr-4 font-medium">Headline</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Category</th>
                <th className="py-2.5 px-3 font-medium whitespace-nowrap">Source · Country</th>
                <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Tone</th>
                <th className="py-2.5 pl-3 font-medium text-right whitespace-nowrap">Hour (UTC)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filteredArticles.slice(0, 35).map((art, idx) => (
                <tr key={`${art.url}-${idx}`} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 pr-4 text-slate-200 max-w-lg">
                    <div className="font-medium text-slate-100 line-clamp-1">{art.title}</div>
                    {art.url && (
                      <a
                        href={art.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-cyan-400 hover:underline"
                      >
                        <span className="truncate max-w-xs">{art.url}</span>
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      </a>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-purple-300 font-medium whitespace-nowrap">
                    {art.category}
                  </td>
                  <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                    {art.source} · {art.country}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-300 whitespace-nowrap">
                    {Number(art.tone).toFixed(2)}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono-tabular text-slate-400 whitespace-nowrap">
                    {art.event_hour}
                  </td>
                </tr>
              ))}
              {filteredArticles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No articles match your active search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
