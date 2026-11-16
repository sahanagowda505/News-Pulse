import { Download, FileSpreadsheet, FileText, Package } from 'lucide-react';
import type { DashboardPayload } from '../types';

interface ReportsViewProps {
  data: DashboardPayload;
}

const EXPORT_ITEMS = [
  {
    id: 'cleaned_articles',
    title: 'Cleaned & Categorized News Dataset',
    ext: 'CSV',
    desc: 'Deduplicated articles with normalized UTC timestamps, country codes, and Spark-classified categories.',
  },
  {
    id: 'trending_topics',
    title: 'Trending Topics & Keyword Ranking',
    ext: 'CSV',
    desc: 'Top extracted keywords ranked by mention frequency and primary domain category.',
  },
  {
    id: 'category_distribution',
    title: 'Category-Wise News Analysis',
    ext: 'CSV',
    desc: 'Article counts, percentage distribution, and average media tone per category.',
  },
  {
    id: 'anomaly_alerts',
    title: 'Anomaly Detection Results',
    ext: 'CSV',
    desc: 'Flagged hourly surges with Z-score, 6h rolling baseline, spike ratio, and explanations.',
  },
  {
    id: 'news_spikes',
    title: 'News Spike Detective Alerts',
    ext: 'CSV',
    desc: 'Detected volume spikes with date/time, previous average vs current volume, % increase, severity, and responsible keywords.',
  },
  {
    id: 'topic_explosions',
    title: 'Topic Explosion Growth Ranking',
    ext: 'CSV',
    desc: 'Rapidly growing keywords comparing previous vs current frequency windows, % growth, and surge onset time.',
  },
  {
    id: 'statistical_summary',
    title: 'Statistical Summary Metrics',
    ext: 'CSV',
    desc: 'Complete dataset-level statistics including raw/cleaned counts, mean, stddev, and bounds.',
  },
  {
    id: 'country_distribution',
    title: 'Country-Wise News Coverage',
    ext: 'CSV',
    desc: 'Regional article distribution, average tone, and top category per country.',
  },
  {
    id: 'source_distribution',
    title: 'News Source Breakdown',
    ext: 'CSV',
    desc: 'Publisher volume, share percentage, average tone, and primary topic domain.',
  },
  {
    id: 'hourly_activity',
    title: 'Hourly Time-Series & Z-Scores',
    ext: 'CSV',
    desc: 'All hourly time windows with rolling average baselines and calculated Z-scores.',
  },
];

export function ReportsView({ data }: ReportsViewProps) {
  const summary = data.summary;
  const hasOutput = Boolean(summary);

  return (
    <div className="space-y-6">
      {/* Dataset & Report Metadata Header */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">
              Analytical Report &amp; Parquet Archive
            </h2>
            {summary ? (
              <p className="mt-1 text-xs text-slate-400 font-mono-tabular">
                Dataset: {summary.datasetName || summary.inputFile} ({summary.isSampleData ? 'Sample' : 'Custom/Live'}) ·{' '}
                {summary.cleanedCount} cleaned records · Generated {new Date(summary.processedAt).toLocaleString()}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">
                Process a dataset in Apache Spark to enable report exports.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <a
              href={hasOutput ? '/api/download/analytical_report' : '#'}
              className={`inline-flex items-center gap-2 rounded-lg border border-purple-400/40 bg-purple-500/20 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all ${
                hasOutput
                  ? 'text-purple-200 hover:bg-purple-500/30'
                  : 'pointer-events-none opacity-40 text-slate-500'
              }`}
            >
              <FileText className="h-4 w-4" />
              <span>Download Analytical Report (.TXT)</span>
            </a>

            <a
              href={hasOutput ? '/api/download/parquet_zip' : '#'}
              className={`inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all ${
                hasOutput
                  ? 'text-slate-950 hover:brightness-110'
                  : 'pointer-events-none opacity-40 bg-slate-800 text-slate-500'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>Download Parquet Archive (.ZIP)</span>
            </a>
          </div>
        </div>
      </section>

      {/* Statistical Summary Preview */}
      {data.statisticalSummary.length > 0 && (
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <h3 className="text-sm font-semibold text-white mb-3">
            Spark Statistical Summary Preview
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {data.statisticalSummary.map((row) => (
              <div
                key={row.metric}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2 text-xs"
              >
                <span className="text-slate-400 truncate">{row.metric}</span>
                <span className="font-mono-tabular font-semibold text-cyan-300 shrink-0">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Downloadable Spark CSV Reports Grid */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {EXPORT_ITEMS.map((rep) => (
          <div
            key={rep.id}
            className="flex flex-col justify-between rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 transition-colors hover:border-slate-700"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <FileSpreadsheet className="h-4 w-4 text-cyan-400 shrink-0" />
                  <span>{rep.title}</span>
                </div>
                <span className="font-mono-tabular text-[11px] text-emerald-400">{rep.ext}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{rep.desc}</p>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between">
              <span className="font-mono-tabular text-[11px] text-slate-500">
                newspulse_{rep.id}.csv
              </span>
              <a
                href={hasOutput ? `/api/download/${rep.id}` : '#'}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  hasOutput
                    ? 'bg-slate-800 text-slate-100 hover:bg-slate-700'
                    : 'pointer-events-none bg-slate-900 text-slate-600'
                }`}
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download CSV</span>
              </a>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
