import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bell,
  Clock,
  Menu,
  Upload,
} from 'lucide-react';
import type { DashboardPayload, JobState, NavSection } from './types';
import { Sidebar } from './components/Sidebar';
import { OverviewView } from './components/OverviewView';
import { TrendsView } from './components/TrendsView';
import { AnomaliesView } from './components/AnomaliesView';
import { IngestView } from './components/IngestView';
import { ReportsView } from './components/ReportsView';
import { NewsSpikeDetectiveView } from './components/NewsSpikeDetectiveView';
import { TopicExplosionView } from './components/TopicExplosionView';

const SECTION_LABELS: Record<NavSection, string> = {
  overview: 'Overview',
  trends: 'Trend Analytics',
  anomalies: 'Anomaly Detection',
  spikes: 'News Spike Detective',
  explosions: 'Topic Explosion Tracker',
  ingest: 'Data Ingestion & Spark',
  reports: 'Reports & Exports',
};

const DEFAULT_JOB_STATE: JobState = {
  status: 'Pending',
  stageIndex: 0,
  stageLabel: 'Idle',
  progressPct: 0,
  datasetName: '',
  isSample: true,
  logs: [],
  error: null,
  startedAt: null,
  finishedAt: null,
};

export default function App() {
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [liveJobState, setLiveJobState] = useState<JobState>(DEFAULT_JOB_STATE);
  const [selectedSample, setSelectedSample] = useState<string>('sample_global_news.csv');
  const [zThreshold, setZThreshold] = useState<number>(1.8);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);
  const [notifOpen, setNotifOpen] = useState<boolean>(false);
  const [focusedAnomalyHour, setFocusedAnomalyHour] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/dashboard');
      const payload = (await res.json()) as DashboardPayload;
      if (!res.ok) {
        throw new Error(payload.error || 'Failed to load Spark dashboard output.');
      }
      setData(payload);
      if (payload.jobState) setLiveJobState(payload.jobState);
      if (payload.samples?.length && !payload.samples.includes(selectedSample)) {
        setSelectedSample(payload.samples[0]);
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to connect to NewsPulse API.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedSample]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Poll real Spark job progress & logs while a job is running
  useEffect(() => {
    if (!isProcessing) return;
    const timer = window.setInterval(() => {
      fetch('/api/status')
        .then((r) => (r.ok ? r.json() : null))
        .then((js: JobState | null) => {
          if (js) setLiveJobState(js);
        })
        .catch(() => {});
    }, 900);
    return () => window.clearInterval(timer);
  }, [isProcessing]);

  const runSampleByName = async (filename: string) => {
    if (!filename) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/process/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, zThreshold }),
      });
      const payload = (await res.json()) as DashboardPayload;
      if (payload.jobState) setLiveJobState(payload.jobState);
      if (!res.ok) {
        if (payload.history && data) {
          setData({ ...data, history: payload.history });
        }
        throw new Error(payload.error || 'Spark failed to process the selected dataset.');
      }
      setData(payload);
      setStatusNotice(
        `Apache Spark processed ${payload.summary?.cleanedCount ?? 0} cleaned articles from ${filename}.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Spark job failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUploadCsv = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusNotice(null);
    try {
      const formData = new FormData();
      formData.append('dataset', file);
      formData.append('zThreshold', String(zThreshold));

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const payload = (await res.json()) as DashboardPayload;
      if (payload.jobState) setLiveJobState(payload.jobState);
      if (!res.ok) {
        if (payload.history && data) {
          setData({ ...data, history: payload.history });
        }
        throw new Error(payload.error || 'Uploaded CSV failed Spark schema validation.');
      }
      setData(payload);
      setStatusNotice(
        `Uploaded dataset "${file.name}" processed by Apache Spark (${payload.summary?.cleanedCount ?? 0} cleaned articles).`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'CSV upload failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCollectGdelt = async (query: string, maxRecords: number, timespan: string) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusNotice(null);
    try {
      const res = await fetch('/api/collect/gdelt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, maxRecords, timespan, zThreshold }),
      });
      const payload = (await res.json()) as DashboardPayload;
      if (payload.jobState) setLiveJobState(payload.jobState);
      if (!res.ok) {
        throw new Error(payload.error || 'Live news collection failed.');
      }
      setData(payload);
      setStatusNotice(
        `Collected live news feed and processed ${payload.summary?.cleanedCount ?? 0} articles in Apache Spark.`
      );
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Live collection error.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRerunCurrentWithThreshold = async () => {
    const activeDataset = data?.summary?.datasetName || selectedSample;
    const isInSamples = data?.samples?.includes(activeDataset);
    await runSampleByName(isInSamples ? activeDataset : selectedSample);
  };

  const emptyPayload: DashboardPayload = {
    summary: null,
    samples: [],
    parquetOutputs: [],
    articles: [],
    categories: [],
    countries: [],
    sources: [],
    hourly: [],
    daily: [],
    heatmap: [],
    topics: [],
    anomalies: [],
    newsSpikes: [],
    topicExplosions: [],
    topicTimeline: [],
    statisticalSummary: [],
    jobState: DEFAULT_JOB_STATE,
    history: [],
  };

  const currentData = data ?? emptyPayload;
  const lastUpdated = currentData.summary?.processedAt
    ? new Date(currentData.summary.processedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : '—';

  const jobBadgeStyle =
    liveJobState.status === 'Running'
      ? 'text-cyan-300 border-cyan-500/40 bg-cyan-950/30'
      : liveJobState.status === 'Failed'
        ? 'text-rose-300 border-rose-500/40 bg-rose-950/30'
        : liveJobState.status === 'Completed'
          ? 'text-emerald-300 border-emerald-500/40 bg-emerald-950/25'
          : 'text-slate-300 border-slate-700 bg-slate-900';

  return (
    <div className="flex min-h-screen bg-[#070B14] bg-[radial-gradient(ellipse_at_top_right,_rgba(34,211,238,0.06),transparent_45%),radial-gradient(ellipse_at_bottom_left,_rgba(168,85,247,0.06),transparent_45%)] text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onNavigate={setActiveSection}
        samples={currentData.samples}
        selectedSample={selectedSample}
        onSelectSample={setSelectedSample}
        zThreshold={zThreshold}
        onChangeZThreshold={setZThreshold}
        onRunSample={() => void runSampleByName(selectedSample)}
        isProcessing={isProcessing}
        anomalyCount={currentData.anomalies.length}
        spikeCount={currentData.newsSpikes.length}
        explosionCount={currentData.topicExplosions.length}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex flex-1 flex-col min-w-0">
        {/* Top Enterprise Navigation Bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-800/80 bg-[#080D1A]/85 backdrop-blur-xl px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-2 lg:hidden">
              <Activity className="h-4 w-4 text-cyan-400" />
              <span className="font-bold text-white whitespace-nowrap">NewsPulse</span>
            </div>

            <div className="hidden sm:flex items-center gap-2 text-sm truncate">
              <span className="font-medium text-slate-400 whitespace-nowrap">NewsPulse</span>
              <span className="text-slate-600">/</span>
              <span className="font-semibold text-white truncate">
                {SECTION_LABELS[activeSection]}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Current Processing Status */}
            <div
              className={`hidden md:flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${jobBadgeStyle}`}
            >
              <span>Spark: {isProcessing ? 'Running' : liveJobState.status}</span>
            </div>

            {/* Last Updated Timestamp */}
            <div className="hidden xl:flex items-center gap-1.5 text-xs text-slate-400 font-mono-tabular whitespace-nowrap">
              <Clock className="h-3.5 w-3.5 text-slate-500" />
              <span>Updated {lastUpdated}</span>
            </div>

            {/* Notification Indicator */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Toggle anomaly notifications"
                className="relative rounded-lg border border-slate-800 bg-slate-900/80 p-2 text-slate-300 hover:border-slate-700 hover:text-white transition-colors"
              >
                <Bell className="h-4 w-4" />
                {currentData.anomalies.length > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 font-mono-tabular text-[10px] font-bold text-white">
                    {currentData.anomalies.length}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-800 bg-[#0B1120] p-3 shadow-2xl z-50">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="text-xs font-semibold text-white">
                      Anomaly Notifications
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotifOpen(false)}
                      className="text-[11px] text-slate-400 hover:text-white"
                    >
                      Close
                    </button>
                  </div>
                  {currentData.anomalies.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-400">
                      No active statistical anomaly alerts.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                      {currentData.anomalies.map((a) => (
                        <button
                          key={a.event_hour}
                          type="button"
                          onClick={() => {
                            setFocusedAnomalyHour(a.event_hour);
                            setActiveSection('anomalies');
                            setNotifOpen(false);
                          }}
                          className="w-full text-left rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 hover:border-rose-500/50 transition-colors"
                        >
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="flex items-center gap-1.5 text-rose-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {a.severity}
                            </span>
                            <span className="font-mono-tabular text-slate-300">
                              Z={a.z_score}
                            </span>
                          </div>
                          <div className="mt-1 text-[11px] text-slate-300">
                            {a.event_hour} UTC · {a.dominant_category} ({a.article_count} articles)
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dataset Upload CTA */}
            <button
              type="button"
              onClick={() => setActiveSection('ingest')}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-3.5 py-2 text-xs font-semibold text-slate-950 shadow-md shadow-cyan-500/15 transition-all hover:brightness-110 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Dataset</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto space-y-5">
          {errorMessage && (
            <div
              role="alert"
              className="flex items-start justify-between gap-4 rounded-xl border border-rose-500/40 bg-rose-950/30 px-4 py-3 text-xs text-rose-200"
            >
              <div>
                <span className="font-semibold text-rose-400">Spark Pipeline Failed: </span>
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-300 hover:text-white whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          )}

          {statusNotice && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-emerald-500/35 bg-emerald-950/25 px-4 py-3 text-xs text-emerald-200">
              <span>{statusNotice}</span>
              <button
                type="button"
                onClick={() => setStatusNotice(null)}
                className="text-emerald-300 hover:text-white whitespace-nowrap"
              >
                Dismiss
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-28 rounded-xl border border-slate-800 bg-slate-900/60 animate-pulse"
                  />
                ))}
              </div>
              <div className="h-80 rounded-xl border border-slate-800 bg-slate-900/60 animate-pulse" />
            </div>
          ) : (
            <>
              {activeSection === 'overview' && (
                <OverviewView
                  data={currentData}
                  onNavigateIngest={() => setActiveSection('ingest')}
                  onInspectAnomaly={(hr) => {
                    setFocusedAnomalyHour(hr);
                    setActiveSection('anomalies');
                  }}
                  onNavigateSpikes={() => setActiveSection('spikes')}
                  onNavigateExplosions={() => setActiveSection('explosions')}
                />
              )}
              {activeSection === 'trends' && <TrendsView data={currentData} />}
              {activeSection === 'anomalies' && (
                <AnomaliesView
                  data={currentData}
                  zThreshold={zThreshold}
                  onChangeZThreshold={setZThreshold}
                  onRerunWithThreshold={() => void handleRerunCurrentWithThreshold()}
                  isProcessing={isProcessing}
                  initialSelectedHour={focusedAnomalyHour}
                />
              )}
              {activeSection === 'spikes' && (
                <NewsSpikeDetectiveView
                  data={currentData}
                  zThreshold={zThreshold}
                  onChangeZThreshold={setZThreshold}
                  onRerunWithThreshold={() => void handleRerunCurrentWithThreshold()}
                  isProcessing={isProcessing}
                  initialSelectedHour={focusedAnomalyHour}
                />
              )}
              {activeSection === 'explosions' && (
                <TopicExplosionView data={currentData} />
              )}
              {activeSection === 'ingest' && (
                <IngestView
                  data={currentData}
                  zThreshold={zThreshold}
                  isProcessing={isProcessing}
                  liveJobState={liveJobState}
                  onUploadCsv={handleUploadCsv}
                  onCollectGdelt={handleCollectGdelt}
                  onRunSampleFile={runSampleByName}
                />
              )}
              {activeSection === 'reports' && <ReportsView data={currentData} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
