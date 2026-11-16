import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Globe,
  Loader2,
  Terminal,
  UploadCloud,
} from 'lucide-react';
import type { CsvPreviewData, DashboardPayload, JobState } from '../types';

interface IngestViewProps {
  data: DashboardPayload;
  zThreshold: number;
  isProcessing: boolean;
  liveJobState: JobState;
  onUploadCsv: (file: File) => Promise<void>;
  onCollectGdelt: (query: string, maxRecords: number, timespan: string) => Promise<void>;
  onRunSampleFile: (filename: string) => Promise<void>;
}

const PIPELINE_STAGES = [
  'Dataset Upload',
  'Data Validation',
  'Data Cleaning',
  'Duplicate Removal',
  'Text Processing',
  'Keyword Extraction',
  'Trend Analysis',
  'Anomaly Detection',
  'Dashboard Update',
];

export function IngestView({
  data,
  zThreshold,
  isProcessing,
  liveJobState,
  onUploadCsv,
  onCollectGdelt,
  onRunSampleFile,
}: IngestViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<CsvPreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [gdeltQuery, setGdeltQuery] = useState('(technology OR climate OR economy OR health)');
  const [maxRecords, setMaxRecords] = useState(100);
  const [timespan, setTimespan] = useState('48h');

  const summary = data.summary;

  useEffect(() => {
    if (!preview && data.samples.length > 0) {
      const target = data.samples.includes('sample_global_news.csv')
        ? 'sample_global_news.csv'
        : data.samples[0];
      fetch(`/api/preview-sample/${encodeURIComponent(target)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((p: CsvPreviewData | null) => {
          if (p) setPreview(p);
        })
        .catch(() => {});
    }
  }, [data.samples, preview]);

  const requestCsvPreview = async (file: File) => {
    setSelectedFile(file);
    setPreviewError(null);
    const fd = new FormData();
    fd.append('dataset', file);
    try {
      const res = await fetch('/api/preview-csv', { method: 'POST', body: fd });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Unable to parse CSV preview.');
      setPreview(payload as CsvPreviewData);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed.');
    }
  };

  const handleSamplePreview = async (filename: string) => {
    setPreviewError(null);
    try {
      const res = await fetch(`/api/preview-sample/${encodeURIComponent(filename)}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Preview failed.');
      setPreview(payload as CsvPreviewData);
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : 'Preview failed.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void requestCsvPreview(file);
  };

  const statusColor =
    liveJobState.status === 'Completed'
      ? 'text-emerald-400'
      : liveJobState.status === 'Running'
        ? 'text-cyan-400'
        : liveJobState.status === 'Failed'
          ? 'text-rose-400'
          : 'text-slate-400';

  return (
    <div className="space-y-6">
      {/* 9-Stage Visual Spark Processing Pipeline */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">
              Apache Spark Processing Pipeline
            </h2>
            <p className="text-xs text-slate-400">
              {liveJobState.stageLabel} {liveJobState.datasetName ? `· ${liveJobState.datasetName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3 font-mono-tabular text-xs">
            <span className={`font-semibold ${statusColor}`}>
              Status: {liveJobState.status}
            </span>
            <span className="text-slate-400">{liveJobState.progressPct}%</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className={`h-full transition-all duration-300 ${
              liveJobState.status === 'Failed'
                ? 'bg-rose-500'
                : liveJobState.status === 'Completed'
                  ? 'bg-gradient-to-r from-cyan-400 to-emerald-400'
                  : 'bg-gradient-to-r from-cyan-400 via-sky-500 to-purple-500'
            }`}
            style={{ width: `${liveJobState.progressPct}%` }}
          />
        </div>

        {/* 9 Visual Stages */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-9">
          {PIPELINE_STAGES.map((stage, idx) => {
            const isFailed = liveJobState.status === 'Failed' && idx === liveJobState.stageIndex;
            const isDone =
              liveJobState.status === 'Completed' ||
              (liveJobState.status === 'Running' && idx < liveJobState.stageIndex);
            const isActive = liveJobState.status === 'Running' && idx === liveJobState.stageIndex;

            return (
              <div
                key={stage}
                className={`rounded-lg border p-2.5 text-center transition-all ${
                  isFailed
                    ? 'border-rose-500/60 bg-rose-950/30 text-rose-300'
                    : isActive
                      ? 'border-cyan-400/70 bg-cyan-950/30 text-cyan-300'
                      : isDone
                        ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                        : 'border-slate-800 bg-[#070B14] text-slate-500'
                }`}
              >
                <div className="flex justify-center mb-1">
                  {isFailed ? (
                    <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                  ) : isActive ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  ) : isDone ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Clock className="h-3.5 w-3.5 text-slate-600" />
                  )}
                </div>
                <div className="text-[11px] font-medium leading-tight">{stage}</div>
              </div>
            );
          })}
        </div>

        {/* Latest Run Metrics */}
        {summary && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 pt-1">
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
              <div className="text-[11px] text-slate-400">Records Received</div>
              <div className="mt-1 font-mono-tabular text-base font-bold text-white">
                {summary.rawCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
              <div className="text-[11px] text-slate-400">Records Processed</div>
              <div className="mt-1 font-mono-tabular text-base font-bold text-emerald-400">
                {summary.cleanedCount}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
              <div className="text-[11px] text-slate-400">Duplicates Removed</div>
              <div className="mt-1 font-mono-tabular text-base font-bold text-purple-300">
                {summary.duplicatesRemoved}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
              <div className="text-[11px] text-slate-400">Invalid Dropped</div>
              <div className="mt-1 font-mono-tabular text-base font-bold text-orange-400">
                {summary.invalidDropped}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3">
              <div className="text-[11px] text-slate-400">Duration</div>
              <div className="mt-1 font-mono-tabular text-base font-bold text-cyan-300">
                {(summary.processingTimeMs / 1000).toFixed(2)}s
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Drag-and-Drop CSV Upload + GDELT Live Collector */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-6">
          <div className="flex items-center gap-2.5">
            <UploadCloud className="h-4 w-4 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">
              Drag &amp; Drop CSV Dataset Upload
            </h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Upload any CSV file with <code className="text-slate-200">title</code> (or <code className="text-slate-200">headline</code>) and <code className="text-slate-200">published_at</code> (or <code className="text-slate-200">date</code>). Dropping a file generates an instant schema preview before Spark runs.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (selectedFile) void onUploadCsv(selectedFile);
            }}
            className="mt-4 space-y-4"
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-xl border-2 border-dashed p-7 text-center transition-all ${
                dragActive
                  ? 'border-cyan-400 bg-cyan-950/25'
                  : 'border-slate-700 bg-[#070B14] hover:border-cyan-500/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void requestCsvPreview(f);
                }}
              />
              <UploadCloud className="mx-auto h-7 w-7 text-cyan-400 mb-2" />
              <div className="text-sm font-medium text-slate-100">
                {selectedFile ? selectedFile.name : 'Drop CSV file here or click to browse'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {selectedFile
                  ? `${(selectedFile.size / 1024).toFixed(1)} KB · Preview loaded below`
                  : 'Supports GDELT exports, Kaggle news datasets, or custom CSVs (max 25 MB)'}
              </div>
            </div>

            <button
              type="submit"
              disabled={!selectedFile || isProcessing}
              className="w-full rounded-lg bg-gradient-to-r from-cyan-400 to-sky-500 px-4 py-2.5 text-xs font-semibold text-slate-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing
                ? 'Running Apache Spark Pipeline...'
                : `Upload & Process with Spark (Z >= ${zThreshold.toFixed(1)})`}
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-6">
          <div className="flex items-center gap-2.5">
            <Globe className="h-4 w-4 text-purple-400" />
            <h2 className="text-base font-semibold text-white">
              Live News Collector (GDELT 2.0 API + RSS)
            </h2>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
            Fetches live global news metadata from GDELT 2.0 DOC API (with automatic BBC/NPR live RSS fallback if GDELT rate-limits), writes CSV, and submits directly to Apache Spark.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onCollectGdelt(gdeltQuery, maxRecords, timespan);
            }}
            className="mt-4 space-y-4"
          >
            <div>
              <label htmlFor="gdelt-query-input" className="block text-xs font-medium text-slate-300 mb-1.5">
                Topic Query
              </label>
              <input
                id="gdelt-query-input"
                type="text"
                value={gdeltQuery}
                onChange={(e) => setGdeltQuery(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="gdelt-max-select" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Max Articles
                </label>
                <select
                  id="gdelt-max-select"
                  value={maxRecords}
                  onChange={(e) => setMaxRecords(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                >
                  <option value={50}>50 articles</option>
                  <option value={100}>100 articles</option>
                  <option value={150}>150 articles</option>
                  <option value={250}>250 articles</option>
                </select>
              </div>

              <div>
                <label htmlFor="gdelt-span-select" className="block text-xs font-medium text-slate-300 mb-1.5">
                  Time Window
                </label>
                <select
                  id="gdelt-span-select"
                  value={timespan}
                  onChange={(e) => setTimespan(e.target.value)}
                  className="w-full rounded-lg border border-slate-700/80 bg-[#070B14] px-3 py-2 text-xs text-slate-100 focus:border-cyan-400 focus:outline-none"
                >
                  <option value="24h">Last 24 hours</option>
                  <option value="48h">Last 48 hours</option>
                  <option value={ '7d' }>Last 7 days</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isProcessing}
              className="w-full rounded-lg border border-purple-400/40 bg-purple-500/20 px-4 py-2.5 text-xs font-semibold text-purple-200 transition-colors hover:bg-purple-500/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isProcessing ? 'Collecting & Running Spark...' : 'Collect Live News & Run Spark'}
            </button>
          </form>
        </section>
      </div>

      {/* Dataset Preview & Column Identification */}
      <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">
              Dataset Preview &amp; Column Identification
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {data.samples.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void handleSamplePreview(s)}
                className="rounded-md border border-slate-700 bg-[#070B14] px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400 hover:text-white"
              >
                Preview {s}
              </button>
            ))}
          </div>
        </div>

        {previewError && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-950/25 p-3 text-xs text-rose-200">
            {previewError}
          </div>
        )}

        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="text-slate-300">
                Inspecting <strong className="text-white">{preview.fileName}</strong> ·{' '}
                <span className="font-mono-tabular">{preview.totalRowsEstimate}</span> rows detected ·{' '}
                <span className={preview.schemaValid ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                  {preview.schemaValid ? 'Schema Valid for Spark' : 'Invalid Schema Detected'}
                </span>
              </div>
              {preview.fileName.startsWith('sample_') && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => void onRunSampleFile(preview.fileName)}
                  className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-slate-700 disabled:opacity-50"
                >
                  Run Spark on {preview.fileName}
                </button>
              )}
            </div>

            {preview.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-950/25 p-3 text-xs text-amber-200">
                {preview.warnings.join(' ')}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
              {preview.detectedMappings.map((m) => (
                <div
                  key={m.column}
                  className="rounded-lg border border-slate-800 bg-[#070B14] px-3 py-2"
                >
                  <div className="font-mono-tabular text-xs font-semibold text-cyan-300 truncate">
                    {m.column}
                  </div>
                  <div className="text-[10px] text-slate-400 truncate">{m.role}</div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto max-h-60">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-slate-800 text-slate-400">
                    {preview.columns.map((c) => (
                      <th key={c} className="py-2 px-2.5 font-medium whitespace-nowrap">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {preview.rows.slice(0, 8).map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-800/30">
                      {preview.columns.map((c) => (
                        <td key={c} className="py-2 px-2.5 text-slate-300 max-w-xs truncate">
                          {row[c] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Execution Logs + Dataset Processing History */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <div className="flex items-center gap-2 mb-3">
            <Terminal className="h-4 w-4 text-cyan-400" />
            <h2 className="text-base font-semibold text-white">Spark Execution Logs</h2>
          </div>
          {liveJobState.error && (
            <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
              <strong>Error: </strong>
              {liveJobState.error}
            </div>
          )}
          <div className="rounded-lg border border-slate-800 bg-[#050811] p-3 font-mono-tabular text-[11px] leading-relaxed text-slate-300 max-h-64 overflow-y-auto space-y-1">
            {liveJobState.logs.length === 0 ? (
              <div className="text-slate-500">
                Spark driver logs will stream here when a dataset is submitted.
              </div>
            ) : (
              liveJobState.logs.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.includes('ERROR') || line.includes('VALIDATION_ERROR')
                      ? 'text-rose-400'
                      : line.includes('[STAGE') || line.includes('completed')
                        ? 'text-cyan-300'
                        : 'text-slate-400'
                  }
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-xl border border-slate-800/90 bg-slate-900/65 backdrop-blur-md p-5">
          <h2 className="text-base font-semibold text-white mb-3">
            Dataset Processing History
          </h2>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="sticky top-0 bg-slate-900">
                <tr className="border-b border-slate-800 text-slate-400">
                  <th className="py-2 pr-3 font-medium">Dataset</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium text-right">Cleaned</th>
                  <th className="py-2 px-2 font-medium text-right">Anomalies</th>
                  <th className="py-2 pl-2 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {data.history.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      No processing runs recorded yet.
                    </td>
                  </tr>
                ) : (
                  data.history.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-800/35">
                      <td className="py-2 pr-3 text-slate-200 max-w-[170px] truncate">
                        {h.datasetName} {h.isSample ? '(Sample)' : ''}
                      </td>
                      <td
                        className={`py-2 px-2 font-semibold ${
                          h.status === 'Completed' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {h.status}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-tabular text-slate-300">
                        {h.cleanedCount}
                      </td>
                      <td className="py-2 px-2 text-right font-mono-tabular text-slate-300">
                        {h.anomalyCount}
                      </td>
                      <td className="py-2 pl-2 text-right font-mono-tabular text-slate-400">
                        {(h.processingTimeMs / 1000).toFixed(1)}s
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
