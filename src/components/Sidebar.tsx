import {
  Activity,
  AlertTriangle,
  Database,
  FileDown,
  Play,
  Radar,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type { NavSection } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onNavigate: (section: NavSection) => void;
  samples: string[];
  selectedSample: string;
  onSelectSample: (sample: string) => void;
  zThreshold: number;
  onChangeZThreshold: (z: number) => void;
  onRunSample: () => void;
  isProcessing: boolean;
  anomalyCount: number;
  spikeCount?: number;
  explosionCount?: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: typeof Activity }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'trends', label: 'Trend Analytics', icon: TrendingUp },
  { id: 'anomalies', label: 'Anomaly Detection', icon: AlertTriangle },
  { id: 'spikes', label: 'News Spike Detective', icon: Radar },
  { id: 'explosions', label: 'Topic Explosion Tracker', icon: Zap },
  { id: 'ingest', label: 'Data Ingestion & Spark', icon: Database },
  { id: 'reports', label: 'Reports & Exports', icon: FileDown },
];

export function Sidebar({
  activeSection,
  onNavigate,
  samples,
  selectedSample,
  onSelectSample,
  zThreshold,
  onChangeZThreshold,
  onRunSample,
  isProcessing,
  anomalyCount,
  spikeCount = 0,
  explosionCount = 0,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/75 backdrop-blur-sm lg:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800/80 bg-[#080D1A]/95 backdrop-blur-xl transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-400 via-sky-500 to-purple-500 shadow-lg shadow-cyan-500/20">
              <Activity className="h-4 w-4 text-slate-950 stroke-[2.5]" />
            </div>
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap">
              NewsPulse
            </span>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 px-3 py-5" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  onCloseMobile();
                }}
                className={`group flex w-full items-center justify-between rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all whitespace-nowrap ${
                  active
                    ? 'bg-gradient-to-r from-cyan-500/20 via-sky-500/15 to-purple-500/10 text-cyan-300 border border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                    : 'text-slate-400 border border-transparent hover:bg-slate-800/60 hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon
                    className={`h-4 w-4 shrink-0 transition-colors ${
                      active ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'
                    }`}
                  />
                  <span>{item.label}</span>
                </span>
                {item.id === 'anomalies' && anomalyCount > 0 && (
                  <span className="font-mono-tabular text-xs font-semibold text-rose-400">
                    {anomalyCount}
                  </span>
                )}
                {item.id === 'spikes' && spikeCount > 0 && (
                  <span className="font-mono-tabular text-xs font-semibold text-amber-300">
                    {spikeCount}
                  </span>
                )}
                {item.id === 'explosions' && explosionCount > 0 && (
                  <span className="font-mono-tabular text-xs font-semibold text-emerald-400">
                    {explosionCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-800/80 p-4 space-y-4 bg-slate-900/30">
          <div>
            <label
              htmlFor="sample-select"
              className="block text-xs font-medium text-slate-300 mb-1.5"
            >
              Quick Sample Dataset
            </label>
            <select
              id="sample-select"
              value={selectedSample}
              onChange={(e) => onSelectSample(e.target.value)}
              className="w-full rounded-lg border border-slate-700/80 bg-[#0B1120] px-2.5 py-2 text-xs text-slate-200 focus:border-cyan-400 focus:outline-none"
            >
              {samples.length === 0 ? (
                <option value="">No CSV samples found</option>
              ) : (
                samples.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <label htmlFor="z-threshold-slider" className="font-medium text-slate-300">
                Z-Score Threshold
              </label>
              <span className="font-mono-tabular font-semibold text-cyan-400">
                {zThreshold.toFixed(1)}
              </span>
            </div>
            <input
              id="z-threshold-slider"
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
            onClick={onRunSample}
            disabled={isProcessing || !selectedSample}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-3 py-2.5 text-xs font-semibold text-slate-950 shadow-md shadow-cyan-500/20 transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            <span>{isProcessing ? 'Running Spark...' : 'Run Spark Pipeline'}</span>
          </button>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Powered by Scala 2.12 &amp; Apache Spark SQL local cluster.
          </p>
        </div>
      </aside>
    </>
  );
}
