import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';

const execFileAsync = promisify(execFile);

const ROOT_DIR = process.cwd();
const DATA_RAW_DIR = path.join(ROOT_DIR, 'data', 'raw');
const OUTPUT_DIR = path.join(ROOT_DIR, 'data', 'processed');
const SPARK_JAR = path.join(ROOT_DIR, 'spark-processor', 'dist', 'newspulse-spark.jar');
const COLLECTOR_SCRIPT = path.join(ROOT_DIR, 'collector', 'gdelt_collector.py');
const HISTORY_PATH = path.join(OUTPUT_DIR, 'job_history.json');

fs.mkdirSync(DATA_RAW_DIR, { recursive: true });
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const upload = multer({
  dest: path.join(ROOT_DIR, 'data', 'uploads'),
  limits: { fileSize: 25 * 1024 * 1024 },
});

type JobStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';

interface JobState {
  status: JobStatus;
  stageIndex: number; // 0..8 matching the 9 visual pipeline stages
  stageLabel: string;
  progressPct: number;
  datasetName: string;
  isSample: boolean;
  logs: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

interface JobHistoryEntry {
  id: string;
  timestamp: string;
  datasetName: string;
  isSample: boolean;
  status: 'Completed' | 'Failed';
  rawCount: number;
  cleanedCount: number;
  duplicatesRemoved: number;
  invalidDropped: number;
  anomalyCount: number;
  processingTimeMs: number;
  errorMessage?: string;
}

const jobState: JobState = {
  status: 'Pending',
  stageIndex: 0,
  stageLabel: 'Idle — Waiting for dataset',
  progressPct: 0,
  datasetName: '',
  isSample: true,
  logs: [],
  error: null,
  startedAt: null,
  finishedAt: null,
};

function readJobHistory(): JobHistoryEntry[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8')) as JobHistoryEntry[];
  } catch {
    return [];
  }
}

function appendJobHistory(entry: JobHistoryEntry) {
  const history = readJobHistory();
  history.unshift(entry);
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history.slice(0, 25), null, 2), 'utf-8');
}

function resolveSparkSubmit(): string {
  const candidates = [
    '/usr/local/bin/spark-submit',
    process.env.SPARK_HOME ? path.join(process.env.SPARK_HOME, 'bin', 'spark-submit') : '',
    '/opt/spark/bin/spark-submit',
    '/usr/local/spark/bin/spark-submit',
    'spark-submit',
  ].filter(Boolean);

  for (const cand of candidates) {
    if (cand === 'spark-submit' || fs.existsSync(cand)) {
      return cand;
    }
  }
  return 'spark-submit';
}

function parseCsvText(content: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    const next = content[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  const records: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const values = rows[r];
    if (values.length === 1 && values[0] === '') continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c]] = values[c] ?? '';
    }
    records.push(obj);
  }
  return records;
}

function inspectCsvPreview(filePath: string, displayName: string) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const sampleText = lines.slice(0, 16).join('\n');
  const previewRows = parseCsvText(sampleText);
  const columns =
    previewRows.length > 0
      ? Object.keys(previewRows[0])
      : lines.length > 0
        ? lines[0].split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
        : [];

  const lowerCols = columns.map((c) => c.toLowerCase().trim());
  const hasTitle = ['title', 'headline', 'article_title', 'news_title'].some((k) => lowerCols.includes(k));
  const hasDate = ['published_at', 'seendate', 'date', 'timestamp', 'published_date', 'datetime'].some((k) =>
    lowerCols.includes(k)
  );

  const detectedMappings = columns.map((col) => {
    const lc = col.toLowerCase();
    let role = 'Metadata';
    if (['title', 'headline', 'article_title', 'news_title'].includes(lc)) role = 'Headline (Required)';
    else if (['published_at', 'seendate', 'date', 'timestamp', 'published_date', 'datetime'].includes(lc))
      role = 'Timestamp (Required)';
    else if (['country', 'sourcecountry', 'country_code', 'location'].includes(lc)) role = 'Country';
    else if (['source', 'domain', 'publisher', 'source_name'].includes(lc)) role = 'News Source';
    else if (['category', 'topic', 'section'].includes(lc)) role = 'Category';
    else if (['description', 'summary', 'content', 'snippet', 'body'].includes(lc)) role = 'Description';
    else if (['url', 'link', 'article_url'].includes(lc)) role = 'Article URL';
    else if (['tone', 'sentiment'].includes(lc)) role = 'Tone Score';
    return { column: col, role };
  });

  return {
    fileName: displayName,
    totalRowsEstimate: Math.max(0, lines.length - 1),
    columns,
    detectedMappings,
    schemaValid: hasTitle,
    warnings: [
      ...(!hasTitle ? ["Missing required 'title' or 'headline' column."] : []),
      ...(!hasDate ? ["Missing timestamp column ('published_at' / 'date' / 'seendate')."] : []),
    ],
    rows: previewRows.slice(0, 12),
  };
}

function readSparkCsvFolder(folderName: string): Record<string, string>[] {
  const dirPath = path.join(OUTPUT_DIR, 'csv', folderName);
  if (!fs.existsSync(dirPath)) return [];
  const partFiles = fs
    .readdirSync(dirPath)
    .filter((f) => f.startsWith('part-') && f.endsWith('.csv'))
    .sort();
  if (partFiles.length === 0) return [];

  let allRows: Record<string, string>[] = [];
  for (const file of partFiles) {
    const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8');
    allRows = allRows.concat(parseCsvText(raw));
  }
  return allRows;
}

function findFirstPartCsv(folderName: string): string | null {
  const dirPath = path.join(OUTPUT_DIR, 'csv', folderName);
  if (!fs.existsSync(dirPath)) return null;
  const part = fs.readdirSync(dirPath).find((f) => f.startsWith('part-') && f.endsWith('.csv'));
  return part ? path.join(dirPath, part) : null;
}

function listParquetDatasets(): string[] {
  const parquetRoot = path.join(OUTPUT_DIR, 'parquet');
  if (!fs.existsSync(parquetRoot)) return [];
  return fs.readdirSync(parquetRoot).filter((name) => {
    const sub = path.join(parquetRoot, name);
    return fs.statSync(sub).isDirectory() && fs.readdirSync(sub).some((f) => f.endsWith('.parquet'));
  });
}

let sparkLock: Promise<void> | null = null;

async function runSparkJob(
  inputCsvPath: string,
  zThreshold = 1.8,
  datasetLabel?: string,
  isSample = false
): Promise<{ summary: Record<string, unknown> }> {
  if (!fs.existsSync(SPARK_JAR)) {
    throw new Error(`Compiled Scala Spark JAR not found at ${SPARK_JAR}. Run scripts/build_spark.sh first.`);
  }
  if (!fs.existsSync(inputCsvPath)) {
    throw new Error(`Input dataset not found: ${inputCsvPath}`);
  }

  while (sparkLock) {
    await sparkLock;
  }

  let releaseLock!: () => void;
  sparkLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });

  const label = datasetLabel || path.basename(inputCsvPath);
  const startMs = Date.now();
  jobState.status = 'Running';
  jobState.stageIndex = 0;
  jobState.stageLabel = 'Dataset Upload & Spark JVM Initialization';
  jobState.progressPct = 10;
  jobState.datasetName = label;
  jobState.isSample = isSample;
  jobState.logs = [`[${new Date().toISOString()}] Submitting NewsPulseJob to Apache Spark (local[*]) for ${label}...`];
  jobState.error = null;
  jobState.startedAt = new Date().toISOString();
  jobState.finishedAt = null;

  try {
    const sparkSubmit = resolveSparkSubmit();
    const args = [
      '--master',
      'local[*]',
      '--driver-memory',
      '1g',
      '--class',
      'com.newspulse.NewsPulseJob',
      SPARK_JAR,
      inputCsvPath,
      OUTPUT_DIR,
      String(zThreshold),
    ];

    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(sparkSubmit, args, {
        cwd: ROOT_DIR,
        env: {
          ...process.env,
          SPARK_HOME: process.env.SPARK_HOME || '/opt/spark',
          SPARK_LOCAL_IP: process.env.SPARK_LOCAL_IP || '127.0.0.1',
        },
      });

      const handleChunk = (chunk: Buffer, isErr: boolean) => {
        const lines = chunk
          .toString('utf-8')
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of lines) {
          // Keep logs informative and concise without flooding memory
          if (
            line.includes('[STAGE') ||
            line.includes('NewsPulse Spark Job') ||
            line.includes('VALIDATION_ERROR') ||
            line.includes('PIPELINE_ERROR') ||
            line.includes('Running Spark version') ||
            (isErr && line.includes('ERROR'))
          ) {
            jobState.logs.push(line);
            if (jobState.logs.length > 80) jobState.logs.shift();
          }

          if (line.includes('[STAGE 1/6]')) {
            jobState.stageIndex = 1;
            jobState.stageLabel = 'Data Validation & Schema Normalization';
            jobState.progressPct = 22;
          } else if (line.includes('[STAGE 2/6]')) {
            jobState.stageIndex = 2;
            jobState.stageLabel = 'Data Cleaning & Duplicate Removal';
            jobState.progressPct = 40;
          } else if (line.includes('[STAGE 3/6]')) {
            jobState.stageIndex = 4;
            jobState.stageLabel = 'Text Processing & News Categorization';
            jobState.progressPct = 55;
          } else if (line.includes('[STAGE 4/6]')) {
            jobState.stageIndex = 6;
            jobState.stageLabel = 'Keyword Extraction & Spark SQL Trend Analysis';
            jobState.progressPct = 72;
          } else if (line.includes('[STAGE 5/6]')) {
            jobState.stageIndex = 7;
            jobState.stageLabel = 'Statistical Anomaly Detection (Z-Score)';
            jobState.progressPct = 86;
          } else if (line.includes('[STAGE 6/6]')) {
            jobState.stageIndex = 8;
            jobState.stageLabel = 'Writing Parquet, CSV & Updating Dashboard';
            jobState.progressPct = 95;
          }
        }
      };

      child.stdout.on('data', (d: Buffer) => handleChunk(d, false));
      child.stderr.on('data', (d: Buffer) => handleChunk(d, true));
      child.on('error', (err) => reject(err));
      child.on('close', (code) => resolve(code ?? 1));
    });

    if (exitCode !== 0) {
      const validationLine = jobState.logs.find(
        (l) => l.includes('VALIDATION_ERROR:') || l.includes('PIPELINE_ERROR:')
      );
      const errText = validationLine
        ? validationLine.split(':').slice(1).join(':').trim()
        : `Spark exited with non-zero code ${exitCode}.`;
      throw new Error(errText);
    }

    const summaryPath = path.join(OUTPUT_DIR, 'pipeline_summary.json');
    if (!fs.existsSync(summaryPath)) {
      throw new Error('Spark completed without generating pipeline_summary.json.');
    }

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) as Record<string, unknown>;
    summary.datasetName = label;
    summary.isSampleData = isSample;
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

    jobState.status = 'Completed';
    jobState.stageIndex = 8;
    jobState.stageLabel = 'Completed — Dashboard updated from Spark output';
    jobState.progressPct = 100;
    jobState.finishedAt = new Date().toISOString();
    jobState.logs.push(
      `[${jobState.finishedAt}] Pipeline completed: ${summary.cleanedCount} cleaned articles, ${summary.anomalyCount} anomalies.`
    );

    appendJobHistory({
      id: `run_${Date.now()}`,
      timestamp: jobState.finishedAt,
      datasetName: label,
      isSample,
      status: 'Completed',
      rawCount: Number(summary.rawCount || 0),
      cleanedCount: Number(summary.cleanedCount || 0),
      duplicatesRemoved: Number(summary.duplicatesRemoved || 0),
      invalidDropped: Number(summary.invalidDropped || 0),
      anomalyCount: Number(summary.anomalyCount || 0),
      processingTimeMs: Number(summary.processingTimeMs || Date.now() - startMs),
    });

    return { summary };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Apache Spark job execution failed.';
    jobState.status = 'Failed';
    jobState.stageLabel = 'Failed — See execution log';
    jobState.error = message;
    jobState.finishedAt = new Date().toISOString();
    jobState.logs.push(`[${jobState.finishedAt}] ERROR: ${message}`);

    appendJobHistory({
      id: `run_${Date.now()}`,
      timestamp: jobState.finishedAt,
      datasetName: label,
      isSample,
      status: 'Failed',
      rawCount: 0,
      cleanedCount: 0,
      duplicatesRemoved: 0,
      invalidDropped: 0,
      anomalyCount: 0,
      processingTimeMs: Date.now() - startMs,
      errorMessage: message,
    });

    throw err;
  } finally {
    sparkLock = null;
    releaseLock();
  }
}

function readDashboardPayload() {
  const summaryPath = path.join(OUTPUT_DIR, 'pipeline_summary.json');
  const summary = fs.existsSync(summaryPath) ? JSON.parse(fs.readFileSync(summaryPath, 'utf-8')) : null;
  if (summary && summary.isSampleData === undefined) {
    const inputName = String(summary.inputFile || '');
    summary.isSampleData = inputName.includes('sample_');
    summary.datasetName = summary.datasetName || path.basename(inputName);
  }

  const samples = fs.existsSync(DATA_RAW_DIR)
    ? fs.readdirSync(DATA_RAW_DIR).filter((f) => f.endsWith('.csv')).sort()
    : [];

  return {
    summary,
    samples,
    parquetOutputs: listParquetDatasets(),
    articles: readSparkCsvFolder('cleaned_articles'),
    categories: readSparkCsvFolder('category_distribution'),
    countries: readSparkCsvFolder('country_distribution'),
    sources: readSparkCsvFolder('source_distribution'),
    hourly: readSparkCsvFolder('hourly_activity'),
    daily: readSparkCsvFolder('daily_activity'),
    heatmap: readSparkCsvFolder('category_hourly_heatmap'),
    topics: readSparkCsvFolder('trending_topics'),
    anomalies: readSparkCsvFolder('anomaly_alerts'),
    newsSpikes: readSparkCsvFolder('news_spikes'),
    topicExplosions: readSparkCsvFolder('topic_explosions'),
    topicTimeline: readSparkCsvFolder('topic_timeline'),
    statisticalSummary: readSparkCsvFolder('statistical_summary'),
    jobState: { ...jobState },
    history: readJobHistory(),
  };
}

function buildAnalyticalReportText(): string {
  const payload = readDashboardPayload();
  const s = payload.summary;
  if (!s) return 'No processed Spark dataset available.';

  const generatedAt = new Date().toISOString();
  const lines: string[] = [
    '====================================================================',
    'NEWSPULSE — ANALYTICAL & STATISTICAL ANOMALY REPORT',
    '====================================================================',
    `Generated At       : ${generatedAt}`,
    `Processing Engine  : ${s.engine}`,
    `Dataset            : ${s.datasetName || s.inputFile} (${s.isSampleData ? 'Sample Dataset' : 'Uploaded / Live Dataset'})`,
    `Processed At       : ${s.processedAt}`,
    `Execution Duration : ${s.processingTimeMs} ms`,
    '',
    '1. DATA CLEANING & PREPROCESSING METRICS',
    '--------------------------------------------------------------------',
    `Raw Records Received      : ${s.rawCount}`,
    `Invalid Records Dropped   : ${s.invalidDropped}`,
    `Duplicate Records Removed : ${s.duplicatesRemoved}`,
    `Cleaned Articles Output   : ${s.cleanedCount}`,
    `Distinct Countries        : ${s.distinctCountries}`,
    `Distinct News Sources     : ${s.distinctSources}`,
    `Coverage Window (UTC)     : ${s.earliestArticle || 'N/A'} -> ${s.latestArticle || 'N/A'}`,
    '',
    '2. CATEGORY DISTRIBUTION (SPARK SQL)',
    '--------------------------------------------------------------------',
    ...payload.categories.map(
      (c) => `  - ${c.category.padEnd(16)} : ${String(c.article_count).padStart(4)} articles (${c.share_pct}%) | Avg Tone: ${c.avg_tone}`
    ),
    '',
    '3. TOP TRENDING KEYWORDS (SPARK SQL TOKENIZATION)',
    '--------------------------------------------------------------------',
    ...payload.topics
      .slice(0, 12)
      .map((t, i) => `  ${String(i + 1).padStart(2)}. ${t.topic.padEnd(18)} : ${t.mentions} mentions (${t.primary_category})`),
    '',
    '4. STATISTICAL ANOMALY DETECTION (Z = (X - Mean) / StdDev)',
    '--------------------------------------------------------------------',
    `Hourly Buckets Analyzed : ${s.hourlyBuckets}`,
    `Global Hourly Mean (μ)  : ${s.globalHourlyMean} articles/hr`,
    `Population StdDev (σ)   : ${s.globalHourlyStddev}`,
    `Active Z-Threshold      : ${s.zThreshold}`,
    `Anomalies Flagged       : ${s.anomalyCount}`,
    `Diagnostic Note         : ${s.statusNote || 'Normal'}`,
    '',
    ...(payload.anomalies.length === 0
      ? ['  No hourly volume surges exceeded the configured Z-score threshold.']
      : payload.anomalies.map(
          (a) =>
            `  [${a.severity}] ${a.event_hour} UTC | Volume: ${a.article_count} | Z-Score: ${a.z_score} | 6h Rolling Avg: ${a.rolling_avg} (${a.spike_ratio}x)\n` +
            `    Category: ${a.dominant_category} | Leading Terms: ${a.top_keywords}\n` +
            `    Explanation: ${a.alert_explanation}`
        )),
    '',
    '5. NEWS SPIKE DETECTIVE & TOPIC EXPLOSION TRACKER (SPARK SQL)',
    '--------------------------------------------------------------------',
    `Total News Spikes         : ${s.totalNewsSpikes ?? payload.newsSpikes.length}`,
    `Highest Spike Category    : ${s.highestSpikeCategory ?? 'None'}`,
    `Rapidly Growing Topics    : ${s.rapidlyGrowingTopics ?? payload.topicExplosions.length}`,
    `Most Explosive Topic      : ${s.mostExplosiveTopic ?? 'None'}`,
    '',
    ...payload.newsSpikes.slice(0, 10).map(
      (sp) =>
        `  [${sp.spike_severity}] ${sp.spike_date} ${sp.spike_time} | ${sp.previous_avg} -> ${sp.current_volume} articles (+${sp.pct_increase}%, Z=${sp.z_score})\n` +
        `    Category: ${sp.responsible_category} | Keywords: ${sp.responsible_keywords}`
    ),
    ...(payload.topicExplosions.length === 0
      ? ['  No rapidly growing topics exceeded explosion thresholds.']
      : [
          '',
          '  Top Rapidly Growing Topics:',
          ...payload.topicExplosions.slice(0, 10).map(
            (te, idx) =>
              `  ${String(idx + 1).padStart(2)}. ${te.topic.padEnd(18)} [${te.explosion_status}] +${te.growth_pct}% (${te.previous_count} -> ${te.current_count}) | Started: ${te.started_increasing_at} | Category: ${te.primary_category}`
          ),
        ]),
    '',
    'Methodology Disclaimer: Statistical anomaly detection flags unusual changes in',
    'news publication volume relative to baseline activity. It does not claim whether',
    'an underlying event is real or whether specific news coverage is accurate or fake.',
    '====================================================================',
  ];
  return lines.join('\n');
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, sparkJarExists: fs.existsSync(SPARK_JAR) });
  });

  app.get('/api/status', (_req, res) => {
    res.json({ ...jobState });
  });

  app.get('/api/dashboard', async (_req, res) => {
    try {
      const summaryPath = path.join(OUTPUT_DIR, 'pipeline_summary.json');
      const defaultSample = path.join(DATA_RAW_DIR, 'sample_global_news.csv');
      if (!fs.existsSync(summaryPath) && fs.existsSync(defaultSample) && fs.existsSync(SPARK_JAR)) {
        await runSparkJob(defaultSample, 1.8, 'sample_global_news.csv', true);
      }
      const payload = readDashboardPayload();
      if (payload.summary && jobState.status === 'Pending') {
        jobState.status = 'Completed';
        jobState.stageIndex = 8;
        jobState.progressPct = 100;
        jobState.stageLabel = 'Completed — Spark output loaded';
        jobState.datasetName = String(payload.summary.datasetName || 'sample_global_news.csv');
        jobState.isSample = Boolean(payload.summary.isSampleData);
        jobState.finishedAt = String(payload.summary.processedAt || '');
        payload.jobState = { ...jobState };
      }
      res.json(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load dashboard payload.';
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/preview-sample/:filename', (req, res) => {
    const filename = String(req.params.filename || '').trim();
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({ error: 'Invalid sample filename.' });
    }
    const targetPath = path.join(DATA_RAW_DIR, filename);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: `Sample '${filename}' not found.` });
    }
    return res.json(inspectCsvPreview(targetPath, filename));
  });

  app.post('/api/preview-csv', upload.single('dataset'), (req, res) => {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No CSV file provided for preview.' });
    }
    try {
      const preview = inspectCsvPreview(file.path, file.originalname);
      return res.json(preview);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to parse CSV preview.';
      return res.status(400).json({ error: message });
    } finally {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
    }
  });

  app.post('/api/process/sample', async (req, res) => {
    try {
      const filename = String(req.body?.filename || '').trim();
      const zThreshold = Number(req.body?.zThreshold ?? 1.8);
      if (!filename || filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid sample filename.' });
      }
      const targetPath = path.join(DATA_RAW_DIR, filename);
      if (!fs.existsSync(targetPath)) {
        return res.status(404).json({ error: `Sample dataset '${filename}' does not exist.` });
      }
      const isSample = filename.startsWith('sample_');
      await runSparkJob(targetPath, Number.isFinite(zThreshold) ? zThreshold : 1.8, filename, isSample);
      res.json(readDashboardPayload());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Spark processing error.';
      res.status(422).json({ error: message, jobState: { ...jobState }, history: readJobHistory() });
    }
  });

  app.post('/api/upload', upload.single('dataset'), async (req, res) => {
    const uploaded = req.file;
    try {
      if (!uploaded) {
        return res.status(400).json({ error: 'No CSV file uploaded.' });
      }
      const ext = path.extname(uploaded.originalname).toLowerCase();
      if (ext !== '.csv') {
        fs.unlinkSync(uploaded.path);
        return res.status(400).json({ error: 'Invalid file type. Only .csv datasets are supported.' });
      }

      const safeName = uploaded.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      const rawDest = path.join(DATA_RAW_DIR, `uploaded_${Date.now()}_${safeName}`);
      fs.renameSync(uploaded.path, rawDest);

      const zThreshold = Number(req.body?.zThreshold ?? 1.8);
      await runSparkJob(rawDest, Number.isFinite(zThreshold) ? zThreshold : 1.8, uploaded.originalname, false);
      res.json(readDashboardPayload());
    } catch (err: unknown) {
      if (uploaded && fs.existsSync(uploaded.path)) {
        fs.unlinkSync(uploaded.path);
      }
      const message = err instanceof Error ? err.message : 'Uploaded dataset validation failed.';
      res.status(422).json({ error: message, jobState: { ...jobState }, history: readJobHistory() });
    }
  });

  app.post('/api/collect/gdelt', async (req, res) => {
    try {
      const query = String(req.body?.query || '(technology OR climate OR economy OR health)').trim();
      const maxRecords = Math.min(Math.max(Number(req.body?.maxRecords || 100), 10), 250);
      const timespan = String(req.body?.timespan || '48h').trim();
      const zThreshold = Number(req.body?.zThreshold ?? 1.8);

      const outCsv = path.join(DATA_RAW_DIR, 'gdelt_live.csv');
      await execFileAsync(
        'python3',
        [COLLECTOR_SCRIPT, '--query', query, '--max-records', String(maxRecords), '--timespan', timespan, '--output', outCsv],
        { cwd: ROOT_DIR, maxBuffer: 5 * 1024 * 1024 }
      );

      await runSparkJob(outCsv, Number.isFinite(zThreshold) ? zThreshold : 1.8, 'gdelt_live.csv', false);
      res.json(readDashboardPayload());
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      let msg = e.message || 'GDELT collection failed.';
      if (e.stderr) {
        try {
          const parsed = JSON.parse(e.stderr.trim());
          if (parsed?.message) msg = `Live Collector Error: ${parsed.message}`;
        } catch {
          msg = e.stderr.trim();
        }
      }
      res.status(502).json({ error: msg, jobState: { ...jobState }, history: readJobHistory() });
    }
  });

  app.get('/api/download/:report', async (req, res) => {
    const report = req.params.report;
    const allowedCsv = new Set([
      'cleaned_articles',
      'anomaly_alerts',
      'hourly_activity',
      'daily_activity',
      'category_distribution',
      'country_distribution',
      'source_distribution',
      'category_hourly_heatmap',
      'trending_topics',
      'news_spikes',
      'topic_explosions',
      'topic_timeline',
      'statistical_summary',
    ]);

    if (report === 'analytical_report') {
      const text = buildAnalyticalReportText();
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="newspulse_analytical_report.txt"');
      return res.send(text);
    }

    if (report === 'parquet_zip') {
      const parquetDir = path.join(OUTPUT_DIR, 'parquet');
      if (!fs.existsSync(parquetDir)) {
        return res.status(404).json({ error: 'No Parquet outputs available yet.' });
      }
      const zipPath = path.join('/tmp', `newspulse_parquet_${Date.now()}.zip`);
      try {
        await execFileAsync('python3', [
          '-c',
          `import zipfile, pathlib; p = pathlib.Path(${JSON.stringify(parquetDir)}); z = zipfile.ZipFile(${JSON.stringify(zipPath)}, 'w', zipfile.ZIP_DEFLATED);\nfor f in p.rglob('*'):\n  if f.is_file() and not f.name.startswith('.') and not f.name.endswith('.crc'): z.write(f, f.relative_to(p.parent))\nz.close()`,
        ]);
        return res.download(zipPath, 'newspulse_parquet_outputs.zip', () => {
          if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to package Parquet archive.';
        return res.status(500).json({ error: message });
      }
    }

    if (!allowedCsv.has(report)) {
      return res.status(400).json({ error: 'Unknown report identifier.' });
    }

    const csvPath = findFirstPartCsv(report);
    if (!csvPath) {
      return res.status(404).json({ error: `Report '${report}' has not been generated yet.` });
    }
    return res.download(csvPath, `newspulse_${report}.csv`);
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(ROOT_DIR, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`NewsPulse server running at http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NewsPulse server:', err);
  process.exit(1);
});
