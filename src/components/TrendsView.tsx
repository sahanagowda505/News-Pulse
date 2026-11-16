import { useMemo, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import type { DashboardPayload } from '../types';
import { PlotlyChart } from './PlotlyChart';

interface TrendsViewProps {
  data: DashboardPayload;
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
];

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'after', 'over', 'amid',
  'into', 'about', 'more', 'than', 'will', 'have', 'has', 'been', 'were', 'are',
  'was', 'its', 'their', 'they', 'what', 'when', 'where', 'which', 'while', 'under',
  'between', 'across', 'against', 'during', 'through', 'before', 'could', 'would',
  'should', 'says', 'said', 'report', 'reports', 'news', 'latest', 'update', 'updates',
  'global', 'world', 'new', 'year', 'years', 'first', 'next', 'high', 'record', 'major',
  'announces', 'announced', 'launches', 'launched', 'shows', 'study', 'plan', 'plans',
  'brief', 'dispatch', 'edition', 'series', 'ahead', 'following',
]);

export function TrendsView({ data }: TrendsViewProps) {
  const allDates = useMemo(
    () => Array.from(new Set(data.articles.map((a) => a.event_date))).sort(),
    [data.articles]
  );

  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [countryFilter, setCountryFilter] = useState<string>('All');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [keywordFilter, setKeywordFilter] = useState<string>('');

  const isFiltered = Boolean(
    startDate ||
      endDate ||
      categoryFilter !== 'All' ||
      countryFilter !== 'All' ||
      sourceFilter !== 'All' ||
      keywordFilter.trim()
  );

  const filteredArticles = useMemo(() => {
    const kw = keywordFilter.trim().toLowerCase();
    return data.articles.filter((a) => {
      if (startDate && a.event_date < startDate) return false;
      if (endDate && a.event_date > endDate) return false;
      if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
      if (countryFilter !== 'All' && a.country !== countryFilter) return false;
      if (sourceFilter !== 'All' && a.source !== sourceFilter) return false;
      if (kw && !a.title.toLowerCase().includes(kw) && !a.description.toLowerCase().includes(kw)) {
        return false;
      }
      return true;
    });
  }, [data.articles, startDate, endDate, categoryFilter, countryFilter, sourceFilter, keywordFilter]);

  const computed = useMemo(() => {
    if (!isFiltered) {
      return {
        categories: data.categories,
        countries: data.countries,
        topics: data.topics,
        hourly: data.hourly.map((h) => ({
          event_hour: h.event_hour,
          article_count: Number(h.article_count),
          rolling_avg: Number(h.rolling_avg),
        })),
        daily: data.daily.map((d) => ({
          event_date: d.event_date,
          article_count: Number(d.article_count),
          avg_tone: Number(d.avg_tone),
        })),
        heatmap: data.heatmap,
      };
    }

    const total = filteredArticles.length || 1;
    const catMap = new Map<string, { count: number; toneSum: number }>();
    const countryMap = new Map<string, { count: number; catCounts: Map<string, number>; toneSum: number }>();
    const hourMap = new Map<string, number>();
    const dayMap = new Map<string, { count: number; toneSum: number }>();
    const kwMap = new Map<string, { count: number; catCounts: Map<string, number> }>();
    const heatRows: { category: string; event_hour: string; article_count: string }[] = [];
    const heatCounter = new Map<string, number>();

    for (const a of filteredArticles) {
      const tone = Number(a.tone) || 0;
      const cEntry = catMap.get(a.category) || { count: 0, toneSum: 0 };
      cEntry.count += 1;
      cEntry.toneSum += tone;
      catMap.set(a.category, cEntry);

      const coEntry = countryMap.get(a.country) || { count: 0, catCounts: new Map(), toneSum: 0 };
      coEntry.count += 1;
      coEntry.toneSum += tone;
      coEntry.catCounts.set(a.category, (coEntry.catCounts.get(a.category) || 0) + 1);
      countryMap.set(a.country, coEntry);

      hourMap.set(a.event_hour, (hourMap.get(a.event_hour) || 0) + 1);

      const dEntry = dayMap.get(a.event_date) || { count: 0, toneSum: 0 };
      dEntry.count += 1;
      dEntry.toneSum += tone;
      dayMap.set(a.event_date, dEntry);

      const hKey = `${a.category}|||${a.event_hour}`;
      heatCounter.set(hKey, (heatCounter.get(hKey) || 0) + 1);

      const words = a.title
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/);
      for (const w of words) {
        if (w.length < 4 || STOP_WORDS.has(w) || /^\d+$/.test(w)) continue;
        const kEntry = kwMap.get(w) || { count: 0, catCounts: new Map() };
        kEntry.count += 1;
        kEntry.catCounts.set(a.category, (kEntry.catCounts.get(a.category) || 0) + 1);
        kwMap.set(w, kEntry);
      }
    }

    heatCounter.forEach((cnt, key) => {
      const [category, event_hour] = key.split('|||');
      heatRows.push({ category, event_hour, article_count: String(cnt) });
    });

    const categories = Array.from(catMap.entries())
      .map(([category, v]) => ({
        category,
        article_count: String(v.count),
        share_pct: ((v.count * 100) / total).toFixed(2),
        avg_tone: (v.toneSum / v.count).toFixed(3),
      }))
      .sort((a, b) => Number(b.article_count) - Number(a.article_count));

    const countries = Array.from(countryMap.entries())
      .map(([country, v]) => {
        let topCat = 'World News';
        let topCnt = -1;
        v.catCounts.forEach((cnt, cat) => {
          if (cnt > topCnt) {
            topCnt = cnt;
            topCat = cat;
          }
        });
        return {
          country,
          article_count: String(v.count),
          avg_tone: (v.toneSum / v.count).toFixed(3),
          top_category: topCat,
        };
      })
      .sort((a, b) => Number(b.article_count) - Number(a.article_count));

    const topics = Array.from(kwMap.entries())
      .map(([topic, v]) => {
        let topCat = 'World News';
        let topCnt = -1;
        v.catCounts.forEach((cnt, cat) => {
          if (cnt > topCnt) {
            topCnt = cnt;
            topCat = cat;
          }
        });
        return {
          topic,
          mentions: String(v.count),
          primary_category: topCat,
        };
      })
      .sort((a, b) => Number(b.mentions) - Number(a.mentions) || a.topic.localeCompare(b.topic))
      .slice(0, 25);

    const sortedHours = Array.from(hourMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const hourly = sortedHours.map(([event_hour, count], idx) => {
      const slice = sortedHours.slice(Math.max(0, idx - 6), idx);
      const rolling =
        slice.length > 0 ? slice.reduce((acc, s) => acc + s[1], 0) / slice.length : count;
      return {
        event_hour,
        article_count: count,
        rolling_avg: Number(rolling.toFixed(2)),
      };
    });

    const daily = Array.from(dayMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([event_date, v]) => ({
        event_date,
        article_count: v.count,
        avg_tone: Number((v.toneSum / v.count).toFixed(3)),
      }));

    return { categories, countries, topics, hourly, daily, heatmap: heatRows };
  }, [isFiltered, filteredArticles, data]);

  const resetFilters = () => {
    setStartDate('');
    setEndDate('');
    setCategoryFilter('All');
    setCountryFilter('All');
    setSourceFilter('All');
    setKeywordFilter('');
  };

  // Build Heatmap matrix
  const heatmapData = useMemo(() => {
    const hours = Array.from(new Set(computed.heatmap.map((h) => h.event_hour))).sort();
    const cats = Array.from(new Set(computed.heatmap.map((h) => h.category))).sort();
    const lookup = new Map<string, number>();
    for (const p of computed.heatmap) {
      lookup.set(`${p.category}|||${p.event_hour}`, Number(p.article_count));
    }
    const z = cats.map((cat) => hours.map((hr) => lookup.get(`${cat}|||${hr}`) ?? 0));
    return { hours, cats, z };
  }, [computed.heatmap]);

  const topTopics = computed.topics.slice(0, 15);
  const topCountries = computed.countries.slice(0, 12);

  return (
    <div className="space-y-6">
      {/* Multi-Dimensional Filter Toolbar */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Trend Analytics Filters</h2>
            <p className="text-xs text-slate-400 tabular-nums">
              {isFiltered
                ? `Filtered subset: ${filteredArticles.length} of ${data.articles.length} Spark-cleaned articles`
                : `Showing direct Apache Spark SQL aggregations across all ${data.articles.length} articles`}
            </p>
          </div>
          {isFiltered && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label htmlFor="trend-from-date" className="block text-[11px] text-slate-400 mb-1">
              From Date
            </label>
            <select
              id="trend-from-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              <option value="">Earliest</option>
              {allDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="trend-to-date" className="block text-[11px] text-slate-400 mb-1">
              To Date
            </label>
            <select
              id="trend-to-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              <option value="">Latest</option>
              {allDates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="trend-category" className="block text-[11px] text-slate-400 mb-1">
              Category
            </label>
            <select
              id="trend-category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Categories</option>
              {data.categories.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="trend-country" className="block text-[11px] text-slate-400 mb-1">
              Country
            </label>
            <select
              id="trend-country"
              value={countryFilter}
              onChange={(e) => setCountryFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Countries</option>
              {data.countries.map((c) => (
                <option key={c.country} value={c.country}>
                  {c.country}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="trend-source" className="block text-[11px] text-slate-400 mb-1">
              News Source
            </label>
            <select
              id="trend-source"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-2.5 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
            >
              <option value="All">All Sources</option>
              {data.sources.map((s) => (
                <option key={s.source} value={s.source}>
                  {s.source}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="trend-keyword" className="block text-[11px] text-slate-400 mb-1">
              Keyword
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                id="trend-keyword"
                type="search"
                value={keywordFilter}
                onChange={(e) => setKeywordFilter(e.target.value)}
                placeholder="e.g. nvidia, treaty..."
                className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] py-2 pl-8 pr-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </section>

      {filteredArticles.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
          No articles match the selected Trend Analytics filter combination. Click &ldquo;Reset Filters&rdquo; to restore all records.
        </div>
      ) : (
        <>
          {/* Trending Keywords + Category Donut */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-7">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-base font-semibold text-white">
                  Trending Keywords &amp; Topic Frequency
                </h2>
                <span className="text-xs text-cyan-400">Top 15 terms</span>
              </div>
              <PlotlyChart
                ariaLabel="Trending keywords horizontal bar chart"
                height={380}
                data={[
                  {
                    x: topTopics.map((t) => Number(t.mentions)),
                    y: topTopics.map((t) => t.topic),
                    type: 'bar',
                    orientation: 'h',
                    marker: {
                      color: topTopics.map((_, i) => PALETTE[i % PALETTE.length]),
                    },
                    text: topTopics.map((t) => `${t.mentions} · ${t.primary_category}`),
                    textposition: 'outside',
                  },
                ]}
                layout={{
                  yaxis: {
                    autorange: 'reversed',
                    gridcolor: 'rgba(30,41,59,0.7)',
                    tickfont: { color: '#CBD5E1', size: 11 },
                  },
                  margin: { l: 105, r: 90, t: 16, b: 36 },
                }}
              />
            </section>

            <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-5">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-base font-semibold text-white">
                  Category-Wise News Share
                </h2>
                <span className="text-xs text-purple-300">Donut breakdown</span>
              </div>
              <PlotlyChart
                ariaLabel="Category share donut chart"
                height={380}
                data={[
                  {
                    labels: computed.categories.map((c) => c.category),
                    values: computed.categories.map((c) => Number(c.article_count)),
                    type: 'pie',
                    hole: 0.56,
                    textinfo: 'label+percent',
                    marker: {
                      colors: PALETTE,
                      line: { color: '#0B1120', width: 2 },
                    },
                  },
                ]}
                layout={{
                  showlegend: false,
                  margin: { l: 20, r: 20, t: 20, b: 20 },
                }}
              />
            </section>
          </div>

          {/* Historical Trend Comparison (Hourly vs Rolling) + Country Distribution */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-base font-semibold text-white">
                  Hourly Activity &amp; Rolling Trend Comparison
                </h2>
                <span className="text-xs text-emerald-400">Time-series</span>
              </div>
              <PlotlyChart
                ariaLabel="Hourly activity and rolling trend line chart"
                height={330}
                data={[
                  {
                    x: computed.hourly.map((h) => h.event_hour),
                    y: computed.hourly.map((h) => h.article_count),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Hourly Volume',
                    line: { color: '#22D3EE', width: 2.5 },
                    marker: { size: 5 },
                  },
                  {
                    x: computed.hourly.map((h) => h.event_hour),
                    y: computed.hourly.map((h) => h.rolling_avg),
                    type: 'scatter',
                    mode: 'lines',
                    name: '6h Rolling Baseline',
                    line: { color: '#F97316', width: 2, dash: 'dot' },
                  },
                ]}
                layout={{
                  legend: { orientation: 'h', y: 1.14, x: 0 },
                  margin: { l: 48, r: 16, t: 36, b: 48 },
                }}
              />
            </section>

            <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
              <div className="flex items-baseline justify-between mb-2">
                <h2 className="text-base font-semibold text-white">
                  Country-Wise Distribution
                </h2>
                <span className="text-xs text-orange-400">Top 12 countries</span>
              </div>
              <PlotlyChart
                ariaLabel="Country-wise news distribution chart"
                height={330}
                data={[
                  {
                    x: topCountries.map((c) => Number(c.article_count)),
                    y: topCountries.map((c) => c.country),
                    type: 'bar',
                    orientation: 'h',
                    marker: {
                      color: topCountries.map((_, i) => PALETTE[(i + 2) % PALETTE.length]),
                    },
                    text: topCountries.map((c) => `${c.article_count} · ${c.top_category}`),
                    textposition: 'outside',
                  },
                ]}
                layout={{
                  yaxis: {
                    autorange: 'reversed',
                    gridcolor: 'rgba(30,41,59,0.7)',
                    tickfont: { color: '#CBD5E1', size: 11 },
                  },
                  margin: { l: 64, r: 96, t: 16, b: 36 },
                }}
              />
            </section>
          </div>

          {/* Category x Hour Heatmap */}
          <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Category &times; Hour Activity Heatmap
                </h2>
                <p className="text-xs text-slate-400">
                  Intensity of news coverage across categories and UTC hours
                </p>
              </div>
              <span className="text-xs text-cyan-400">Spark SQL Matrix</span>
            </div>
            <PlotlyChart
              ariaLabel="Category by hour news intensity heatmap"
              height={320}
              data={[
                {
                  z: heatmapData.z,
                  x: heatmapData.hours,
                  y: heatmapData.cats,
                  type: 'heatmap',
                  colorscale: [
                    [0, '#0F172A'],
                    [0.25, '#1E3A8A'],
                    [0.5, '#7C3AED'],
                    [0.75, '#06B6D4'],
                    [1, '#F97316'],
                  ],
                  hovertemplate: '<b>%{y}</b><br>Hour: %{x}<br>Articles: %{z}<extra></extra>',
                },
              ]}
              layout={{
                margin: { l: 110, r: 20, t: 16, b: 48 },
              }}
            />
          </section>

          {/* Daily Activity + Topic Frequency Ranking Table */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-6">
              <h2 className="text-base font-semibold text-white mb-2">
                Daily News Activity &amp; Tone
              </h2>
              <PlotlyChart
                ariaLabel="Daily news activity and average tone chart"
                height={300}
                data={[
                  {
                    x: computed.daily.map((d) => d.event_date),
                    y: computed.daily.map((d) => d.article_count),
                    type: 'bar',
                    name: 'Daily Volume',
                    marker: { color: '#10B981' },
                  },
                  {
                    x: computed.daily.map((d) => d.event_date),
                    y: computed.daily.map((d) => d.avg_tone),
                    type: 'scatter',
                    mode: 'lines+markers',
                    name: 'Avg Tone',
                    yaxis: 'y2',
                    line: { color: '#FB7185', width: 2.5 },
                  },
                ]}
                layout={{
                  legend: { orientation: 'h', y: 1.15, x: 0 },
                  yaxis: { title: 'Articles', gridcolor: 'rgba(30,41,59,0.7)' },
                  yaxis2: { title: 'Avg Tone', overlaying: 'y', side: 'right', showgrid: false },
                  margin: { l: 50, r: 50, t: 36, b: 44 },
                }}
              />
            </section>

            <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 xl:col-span-6">
              <h2 className="text-base font-semibold text-white mb-3">
                Topic Frequency Ranking
              </h2>
              <div className="overflow-x-auto max-h-[290px]">
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 bg-slate-900">
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-3 font-medium">Rank</th>
                      <th className="py-2 px-3 font-medium">Keyword / Topic</th>
                      <th className="py-2 px-3 font-medium">Primary Category</th>
                      <th className="py-2 pl-3 font-medium text-right">Mentions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {computed.topics.slice(0, 15).map((t, idx) => (
                      <tr key={t.topic} className="hover:bg-slate-800/40">
                        <td className="py-2 pr-3 font-mono-tabular text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3 font-medium text-white capitalize">
                          {t.topic}
                        </td>
                        <td className="py-2 px-3 text-cyan-300">{t.primary_category}</td>
                        <td className="py-2 pl-3 text-right font-mono-tabular text-slate-200">
                          {t.mentions}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
