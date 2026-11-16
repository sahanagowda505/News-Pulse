export type NavSection =
  | 'overview'
  | 'trends'
  | 'anomalies'
  | 'spikes'
  | 'explosions'
  | 'ingest'
  | 'reports';

export type JobStatus = 'Pending' | 'Running' | 'Completed' | 'Failed';

export interface PipelineSummary {
  status: string;
  engine: string;
  inputFile: string;
  datasetName?: string;
  isSampleData?: boolean;
  outputDir: string;
  rawCount: number;
  invalidDropped: number;
  duplicatesRemoved: number;
  cleanedCount: number;
  distinctCountries: number;
  distinctSources: number;
  hourlyBuckets: number;
  topCategory: string;
  topTopic: string;
  anomalyCount: number;
  totalNewsSpikes?: number;
  rapidlyGrowingTopics?: number;
  highestSpikeCategory?: string;
  mostExplosiveTopic?: string;
  insufficientTopicHistory?: boolean;
  zThreshold: number;
  globalHourlyMean: number;
  globalHourlyStddev: number;
  minHourlyVolume: number;
  maxHourlyVolume: number;
  insufficientData: boolean;
  zeroStddev: boolean;
  statusNote: string;
  earliestArticle: string;
  latestArticle: string;
  processingTimeMs: number;
  processedAt: string;
}

export interface JobState {
  status: JobStatus;
  stageIndex: number;
  stageLabel: string;
  progressPct: number;
  datasetName: string;
  isSample: boolean;
  logs: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface JobHistoryEntry {
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

export interface CsvPreviewData {
  fileName: string;
  totalRowsEstimate: number;
  columns: string[];
  detectedMappings: { column: string; role: string }[];
  schemaValid: boolean;
  warnings: string[];
  rows: Record<string, string>[];
}

export interface NewsArticle {
  title: string;
  description: string;
  url: string;
  source: string;
  country: string;
  category: string;
  tone: string;
  published_iso: string;
  event_date: string;
  event_hour: string;
}

export interface CategoryStat {
  category: string;
  article_count: string;
  share_pct: string;
  avg_tone: string;
}

export interface CountryStat {
  country: string;
  article_count: string;
  avg_tone: string;
  top_category: string;
}

export interface SourceStat {
  source: string;
  article_count: string;
  share_pct: string;
  avg_tone: string;
  top_category: string;
}

export interface HeatmapPoint {
  category: string;
  event_hour: string;
  article_count: string;
}

export interface HourlyStat {
  event_hour: string;
  article_count: string;
  avg_tone: string;
  dominant_category: string;
  top_keywords: string;
  rolling_avg: string;
  global_mean: string;
  global_stddev: string;
  z_score: string;
  spike_ratio: string;
  is_anomaly: string;
  severity: string;
  alert_message: string;
  alert_explanation: string;
}

export interface DailyStat {
  event_date: string;
  article_count: string;
  avg_tone: string;
}

export interface TopicStat {
  topic: string;
  mentions: string;
  primary_category: string;
}

export interface StatisticalMetric {
  metric: string;
  value: string;
}

export interface NewsSpike {
  event_hour: string;
  spike_date: string;
  spike_time: string;
  current_volume: string;
  previous_avg: string;
  pct_increase: string;
  z_score: string;
  spike_severity: 'Moderate' | 'High' | 'Critical' | string;
  responsible_category: string;
  responsible_keywords: string;
  spike_summary: string;
}

export interface TopicExplosion {
  topic: string;
  primary_category: string;
  previous_count: string;
  current_count: string;
  growth_pct: string;
  total_mentions: string;
  started_increasing_at: string;
  peak_hour: string;
  explosion_status: 'Emerging Surge' | 'Explosive' | 'Rapid Growth' | 'Accelerating' | string;
}

export interface TopicTimelinePoint {
  topic: string;
  event_hour: string;
  mentions: string;
}

export interface DashboardPayload {
  summary: PipelineSummary | null;
  samples: string[];
  parquetOutputs: string[];
  articles: NewsArticle[];
  categories: CategoryStat[];
  countries: CountryStat[];
  sources: SourceStat[];
  hourly: HourlyStat[];
  daily: DailyStat[];
  heatmap: HeatmapPoint[];
  topics: TopicStat[];
  anomalies: HourlyStat[];
  newsSpikes: NewsSpike[];
  topicExplosions: TopicExplosion[];
  topicTimeline: TopicTimelinePoint[];
  statisticalSummary: StatisticalMetric[];
  jobState: JobState;
  history: JobHistoryEntry[];
  error?: string;
}
