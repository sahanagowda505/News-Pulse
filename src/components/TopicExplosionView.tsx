import { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Flame,
  Info,
  Search,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import type { DashboardPayload, TopicExplosion } from '../types';
import { PlotlyChart } from './PlotlyChart';

interface TopicExplosionViewProps {
  data: DashboardPayload;
  initialSelectedTopic?: string | null;
}

const PALETTE = [
  '#22D3EE',
  '#A855F7',
  '#10B981',
  '#F97316',
  '#FB7185',
  '#38BDF8',
  '#FACC15',
  '#818CF8',
  '#34D399',
  '#F472B6',
];

const STATUS_STYLE: Record<string, string> = {
  Explosive: 'text-rose-400',
  'Emerging Surge': 'text-cyan-300',
  'Rapid Growth': 'text-orange-400',
  Accelerating: 'text-emerald-400',
};

export function TopicExplosionView({
  data,
  initialSelectedTopic,
}: TopicExplosionViewProps) {
  const summary = data.summary;
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTopicName, setSelectedTopicName] = useState<string | null>(
    initialSelectedTopic || data.topicExplosions[0]?.topic || null
  );

  const availableCategories = useMemo(() => {
    const set = new Set(data.topicExplosions.map((t) => t.primary_category).filter(Boolean));
    return Array.from(set).sort();
  }, [data.topicExplosions]);

  const filteredExplosions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return data.topicExplosions.filter((te) => {
      if (categoryFilter !== 'All' && te.primary_category !== categoryFilter) return false;
      if (statusFilter !== 'All' && te.explosion_status !== statusFilter) return false;
      if (q && !te.topic.toLowerCase().includes(q) && !te.primary_category.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [data.topicExplosions, searchTerm, categoryFilter, statusFilter]);

  const top10Topics = useMemo(() => filteredExplosions.slice(0, 10), [filteredExplosions]);

  useEffect(() => {
    if (
      initialSelectedTopic &&
      data.topicExplosions.some((t) => t.topic.toLowerCase() === initialSelectedTopic.toLowerCase())
    ) {
      setSelectedTopicName(initialSelectedTopic);
      return;
    }
    if (
      filteredExplosions.length > 0 &&
      !filteredExplosions.some((t) => t.topic === selectedTopicName)
    ) {
      setSelectedTopicName(filteredExplosions[0].topic);
    } else if (filteredExplosions.length === 0) {
      setSelectedTopicName(null);
    }
  }, [initialSelectedTopic, data.topicExplosions, filteredExplosions, selectedTopicName]);

  const activeTopic: TopicExplosion | null = useMemo(() => {
    if (!selectedTopicName) return filteredExplosions[0] ?? null;
    return (
      filteredExplosions.find((t) => t.topic.toLowerCase() === selectedTopicName.toLowerCase()) ??
      filteredExplosions[0] ??
      null
    );
  }, [selectedTopicName, filteredExplosions]);

  const relatedArticles = useMemo(() => {
    if (!activeTopic) return [];
    const kw = activeTopic.topic.toLowerCase();
    return data.articles
      .filter(
        (art) =>
          art.title.toLowerCase().includes(kw) ||
          art.description.toLowerCase().includes(kw)
      )
      .sort((a, b) => {
        // Prioritize articles at/after started_increasing_at, then newest
        const aInWindow = a.event_hour >= activeTopic.started_increasing_at ? 1 : 0;
        const bInWindow = b.event_hour >= activeTopic.started_increasing_at ? 1 : 0;
        if (aInWindow !== bInWindow) return bInWindow - aInWindow;
        return b.published_iso.localeCompare(a.published_iso);
      });
  }, [activeTopic, data.articles]);

  if (!summary || data.hourly.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
        Process a dataset first to inspect Topic Explosion growth metrics.
      </div>
    );
  }

  const maxGrowth = data.topicExplosions.reduce(
    (max, t) => Math.max(max, Number(t.growth_pct) || 0),
    0
  );

  // Build trajectory chart traces for top 6 topics (plus activeTopic if outside top 6)
  const timelineHours = data.hourly.map((h) => h.event_hour);
  const trajectoryTopics = useMemo(() => {
    const base = data.topicExplosions.slice(0, 6).map((t) => t.topic);
    if (activeTopic && !base.includes(activeTopic.topic)) {
      base.push(activeTopic.topic);
    }
    return base;
  }, [data.topicExplosions, activeTopic]);

  const timelineLookup = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const pt of data.topicTimeline) {
      if (!map.has(pt.topic)) map.set(pt.topic, new Map());
      map.get(pt.topic)!.set(pt.event_hour, Number(pt.mentions) || 0);
    }
    return map;
  }, [data.topicTimeline]);

  const trajectoryTraces = trajectoryTopics.map((topicName, idx) => {
    const hourMap = timelineLookup.get(topicName);
    const isFocused = activeTopic?.topic === topicName;
    return {
      x: timelineHours,
      y: timelineHours.map((hr) => hourMap?.get(hr) ?? 0),
      type: 'scatter',
      mode: 'lines+markers',
      name: topicName,
      line: {
        color: PALETTE[idx % PALETTE.length],
        width: isFocused ? 3.5 : 1.8,
        shape: 'spline',
      },
      marker: { size: isFocused ? 7 : 4 },
      opacity: activeTopic && !isFocused ? 0.45 : 1,
    };
  });

  const barTrace = {
    x: top10Topics.map((t) => Number(t.growth_pct)),
    y: top10Topics.map((t) => t.topic),
    type: 'bar',
    orientation: 'h',
    marker: {
      color: top10Topics.map((t, idx) =>
        activeTopic?.topic === t.topic ? '#22D3EE' : PALETTE[(idx + 1) % PALETTE.length]
      ),
    },
    text: top10Topics.map(
      (t) => `+${t.growth_pct}% (${t.previous_count}→${t.current_count})`
    ),
    textposition: 'outside',
    hovertemplate:
      '<b>%{y}</b><br>Growth: +%{x}%<br>%{text}<extra></extra>',
  };

  return (
    <div className="space-y-6">
      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400/80 to-purple-500/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Rapidly Growing Topics</span>
            <TrendingUp className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-white">
            {data.topicExplosions.length}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Keywords surging vs. prior window
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-rose-500/80 to-amber-400/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Most Explosive Topic</span>
            <Flame className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white truncate capitalize">
            {summary.mostExplosiveTopic && summary.mostExplosiveTopic !== 'None'
              ? summary.mostExplosiveTopic
              : 'None'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Highest Spark window acceleration
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-emerald-400/80 to-cyan-400/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Peak Topic Growth</span>
            <Sparkles className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-emerald-400">
            {data.topicExplosions.length > 0 ? `+${maxGrowth.toFixed(1)}%` : '0.0%'}
          </div>
          <div className="mt-1 text-xs text-slate-400">
            3h current window vs 6h baseline
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-purple-400/80 to-indigo-500/80" />
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Comparison Windows</span>
            <Clock className="h-4 w-4 text-purple-400" />
          </div>
          <div className="mt-2 font-mono-tabular text-2xl font-bold text-purple-300">
            3h vs. 6h
          </div>
          <div className="mt-1 text-xs text-slate-400 tabular-nums">
            Across {summary.hourlyBuckets} hourly buckets
          </div>
        </div>
      </div>

      {/* Safeguard Notice for Insufficient History */}
      {summary.insufficientTopicHistory && (
        <div
          role="status"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-950/25 p-4 text-xs text-amber-200"
        >
          <Info className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <strong className="text-amber-300">Insufficient Historical Windows: </strong>
            At least 3 distinct hourly intervals are required in Apache Spark to compare current topic frequency against previous time periods.
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <section className="flex flex-col gap-3 rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search surging topic or category..."
            className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] py-1.5 pl-8 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter explosive topics by category"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-slate-700/80 bg-[#070B14] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
          >
            <option value="All">All Categories</option>
            {availableCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by explosion status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-slate-700/80 bg-[#070B14] px-3 py-1.5 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
          >
            <option value="All">All Growth Tiers</option>
            <option value="Explosive">Explosive</option>
            <option value="Emerging Surge">Emerging Surge</option>
            <option value="Rapid Growth">Rapid Growth</option>
            <option value="Accelerating">Accelerating</option>
          </select>
        </div>
      </section>

      {/* Top 10 Growth Bar Chart + Hourly Trajectory Chart */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                Top 10 Rapidly Growing Topics (% Growth)
              </h2>
              <p className="text-xs text-slate-400">
                Click any bar to inspect timeline and related news articles
              </p>
            </div>
            <span className="text-xs text-cyan-400">Spark SQL Window</span>
          </div>

          {top10Topics.length === 0 ? (
            <div className="py-24 text-center text-xs text-slate-400">
              No rapidly growing topics detected for the current dataset or filters.
            </div>
          ) : (
            <PlotlyChart
              ariaLabel="Top 10 rapidly growing topics by percentage growth"
              height={340}
              data={[barTrace]}
              onPointClick={(idx) => {
                const chosen = top10Topics[idx];
                if (chosen) setSelectedTopicName(chosen.topic);
              }}
              layout={{
                yaxis: {
                  autorange: 'reversed',
                  gridcolor: 'rgba(30,41,59,0.7)',
                  tickfont: { color: '#CBD5E1', size: 11 },
                },
                xaxis: {
                  title: { text: 'Growth (%)', font: { size: 11, color: '#94A3B8' } },
                  gridcolor: 'rgba(30,41,59,0.7)',
                  tickfont: { color: '#94A3B8', size: 11 },
                },
                margin: { l: 105, r: 110, t: 16, b: 42 },
              }}
            />
          )}
        </section>

        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <div>
              <h2 className="text-base font-semibold text-white">
                Hourly Topic Acceleration Trajectory
              </h2>
              <p className="text-xs text-slate-400">
                Hourly mention frequency highlighting when explosive topics surged
              </p>
            </div>
            {activeTopic && (
              <span className="text-xs font-semibold text-cyan-300 capitalize">
                Focused: {activeTopic.topic}
              </span>
            )}
          </div>

          {trajectoryTraces.length === 0 ? (
            <div className="py-24 text-center text-xs text-slate-400">
              No hourly topic timeline available.
            </div>
          ) : (
            <PlotlyChart
              ariaLabel="Hourly topic frequency timeline for top explosive topics"
              height={340}
              data={trajectoryTraces}
              layout={{
                legend: { orientation: 'h', y: 1.16, x: 0 },
                margin: { l: 44, r: 16, t: 40, b: 48 },
              }}
            />
          )}
        </section>
      </div>

      {/* Interactive Table + Related News Articles */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        {/* Top 10 / 15 Table */}
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-white">
                Explosive Topics Ranking
              </h2>
              <p className="text-xs text-slate-400">
                Select a row to view exact surge timing and matching articles
              </p>
            </div>
            <span className="font-mono-tabular text-xs text-slate-400">
              {filteredExplosions.length} topics
            </span>
          </div>

          {filteredExplosions.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">
              No topics match your current filter selection.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2.5 pr-3 font-medium">Topic</th>
                    <th className="py-2.5 px-2.5 font-medium">Category</th>
                    <th className="py-2.5 px-2.5 font-medium text-right whitespace-nowrap">Prev &rarr; Curr</th>
                    <th className="py-2.5 px-2.5 font-medium text-right whitespace-nowrap">Growth</th>
                    <th className="py-2.5 px-2.5 font-medium whitespace-nowrap">Started Increasing</th>
                    <th className="py-2.5 pl-2.5 font-medium text-right">Tier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {filteredExplosions.slice(0, 10).map((te) => {
                    const isSelected = activeTopic?.topic === te.topic;
                    return (
                      <tr
                        key={te.topic}
                        onClick={() => setSelectedTopicName(te.topic)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-cyan-950/35' : 'hover:bg-slate-800/45'
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-semibold text-white capitalize">
                          {te.topic}
                        </td>
                        <td className="py-2.5 px-2.5 text-purple-300 whitespace-nowrap">
                          {te.primary_category}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-300 whitespace-nowrap">
                          {te.previous_count} &rarr; <strong className="text-white">{te.current_count}</strong>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold text-emerald-400 whitespace-nowrap">
                          +{te.growth_pct}%
                        </td>
                        <td className="py-2.5 px-2.5 font-mono-tabular text-slate-400 whitespace-nowrap">
                          {te.started_increasing_at} UTC
                        </td>
                        <td
                          className={`py-2.5 pl-2.5 text-right font-semibold whitespace-nowrap ${
                            STATUS_STYLE[te.explosion_status] ?? 'text-slate-300'
                          }`}
                        >
                          {te.explosion_status}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Related Articles Panel */}
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">
              Topic Evidence &amp; Articles
            </h2>
            {activeTopic && (
              <span className="font-mono-tabular text-xs font-semibold text-cyan-300 capitalize">
                #{activeTopic.topic}
              </span>
            )}
          </div>

          {!activeTopic ? (
            <p className="py-12 text-center text-xs text-slate-400">
              Select a growing topic to inspect its surge timeline and matching articles.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Previous vs. Current</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-white">
                    {activeTopic.previous_count} &rarr; {activeTopic.current_count} mentions
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Growth Rate</div>
                  <div className="mt-1 font-mono-tabular text-sm font-bold text-emerald-400">
                    +{activeTopic.growth_pct}%
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Started Increasing</div>
                  <div className="mt-1 font-mono-tabular text-xs font-semibold text-cyan-300">
                    {activeTopic.started_increasing_at} UTC
                  </div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
                  <div className="text-[11px] text-slate-400">Peak Activity Hour</div>
                  <div className="mt-1 font-mono-tabular text-xs font-semibold text-amber-300">
                    {activeTopic.peak_hour} UTC
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-300">
                    Related News Articles ({relatedArticles.length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Category: {activeTopic.primary_category}
                  </span>
                </div>

                {relatedArticles.length === 0 ? (
                  <p className="rounded-lg border border-slate-800 bg-[#070B14] p-4 text-xs text-slate-400">
                    No matching articles found in the cleaned dataset.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {relatedArticles.slice(0, 20).map((art, idx) => (
                      <div
                        key={`${art.url}-${idx}`}
                        className="rounded-lg border border-slate-800/80 bg-[#070B14] px-3 py-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium text-slate-100 leading-snug">
                            {art.title}
                          </p>
                          {art.url && (
                            <a
                              href={art.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 text-cyan-400 hover:text-cyan-300"
                              aria-label={`Read ${art.title}`}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                          <span className="text-purple-300">{art.category}</span>
                          <span>·</span>
                          <span>{art.source}</span>
                          <span>·</span>
                          <span className="font-mono-tabular">{art.event_hour} UTC</span>
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
