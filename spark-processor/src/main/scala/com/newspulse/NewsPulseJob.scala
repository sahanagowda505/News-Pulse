package com.newspulse

import org.apache.spark.sql.{DataFrame, SparkSession}
import org.apache.spark.sql.expressions.Window
import org.apache.spark.sql.functions._
import org.apache.spark.sql.types._

import java.io.{File, PrintWriter}
import java.nio.charset.StandardCharsets
import scala.util.Try

/**
 * NewsPulseJob
 * ------------
 * Core Apache Spark & Spark SQL batch processing pipeline for NewsPulse:
 *   1. Ingestion & Schema Validation (flexible column alias mapping)
 *   2. Data Cleaning (trimming, timestamp normalization, missing value imputation, deduplication)
 *   3. News Categorization (8 canonical domains via Scala UDF)
 *   4. Trend Analysis via Spark SQL (categories, countries, sources, hourly/daily activity, heatmaps, keywords)
 *   5. Statistical Anomaly Detection (Z = (X - Mean) / StdDev + 6-Hour Rolling Average via Spark Window Functions)
 *   6. Dual Storage Export (Apache Parquet + CSV + Statistical Summary + JSON execution summary)
 */
object NewsPulseJob {

  private val StopWords: Set[String] = Set(
    "the", "and", "for", "with", "from", "that", "this", "after", "over", "amid",
    "into", "about", "more", "than", "will", "have", "has", "been", "were", "are",
    "was", "its", "their", "they", "what", "when", "where", "which", "while", "under",
    "between", "across", "against", "during", "through", "before", "could", "would",
    "should", "says", "said", "report", "reports", "news", "latest", "update", "updates",
    "global", "world", "new", "year", "years", "first", "next", "high", "record", "major",
    "announces", "announced", "launches", "launched", "shows", "study", "plan", "plans",
    "brief", "dispatch", "edition", "series", "ahead", "following", "amidst",
    "align", "expands", "cross", "unveil", "updated", "advances"
  )

  private val CountryNormalizationMap: Map[String, String] = Map(
    "united states" -> "US",
    "usa" -> "US",
    "u.s." -> "US",
    "united kingdom" -> "GB",
    "uk" -> "GB",
    "great britain" -> "GB",
    "india" -> "IN",
    "germany" -> "DE",
    "japan" -> "JP",
    "france" -> "FR",
    "canada" -> "CA",
    "brazil" -> "BR",
    "australia" -> "AU",
    "singapore" -> "SG",
    "china" -> "CN",
    "south korea" -> "KR",
    "spain" -> "ES",
    "italy" -> "IT",
    "switzerland" -> "CH"
  )

  def main(args: Array[String]): Unit = {
    if (args.length < 2) {
      System.err.println("Usage: NewsPulseJob <inputCsvPath> <outputBaseDir> [zThreshold]")
      System.exit(1)
    }

    val inputCsvPath  = args(0)
    val outputBaseDir = args(1)
    val zThreshold    = if (args.length >= 3) Try(args(2).toDouble).getOrElse(1.8) else 1.8
    val startTimeMs   = System.currentTimeMillis()

    val spark = SparkSession
      .builder()
      .appName("NewsPulse-Spark-Pipeline")
      .master(sys.props.getOrElse("spark.master", "local[*]"))
      .config("spark.driver.host", "127.0.0.1")
      .config("spark.driver.bindAddress", "127.0.0.1")
      .config("spark.sql.session.timeZone", "UTC")
      .config("spark.sql.shuffle.partitions", "4")
      .config("spark.ui.enabled", "false")
      .getOrCreate()

    spark.sparkContext.setLogLevel("WARN")

    try {
      runPipeline(spark, inputCsvPath, outputBaseDir, zThreshold, startTimeMs)
    } catch {
      case ex: IllegalArgumentException =>
        System.err.println(s"VALIDATION_ERROR: ${ex.getMessage}")
        System.exit(2)
      case ex: Throwable =>
        System.err.println(s"PIPELINE_ERROR: ${ex.getMessage}")
        ex.printStackTrace(System.err)
        System.exit(3)
    } finally {
      spark.stop()
    }
  }

  private def resolveColumn(df: DataFrame, candidates: Seq[String], defaultExpr: org.apache.spark.sql.Column): org.apache.spark.sql.Column = {
    val colsLower = df.columns.map(c => c.toLowerCase.trim -> c).toMap
    candidates.flatMap(c => colsLower.get(c.toLowerCase)).headOption match {
      case Some(actualCol) => col(s"`$actualCol`").cast(StringType)
      case None            => defaultExpr
    }
  }

  private def runPipeline(
      spark: SparkSession,
      inputCsvPath: String,
      outputBaseDir: String,
      zThreshold: Double,
      startTimeMs: Long
  ): Unit = {
    import spark.implicits._

    println("[STAGE 1/6] Ingestion & Schema Validation...")
    val rawDf = spark.read
      .option("header", "true")
      .option("multiLine", "true")
      .option("escape", "\"")
      .option("quote", "\"")
      .option("ignoreLeadingWhiteSpace", "true")
      .option("ignoreTrailingWhiteSpace", "true")
      .csv(inputCsvPath)

    val rawCount = rawDf.count()
    if (rawCount == 0) {
      throw new IllegalArgumentException("Uploaded CSV dataset contains 0 data rows.")
    }

    val lowerCols = rawDf.columns.map(_.toLowerCase.trim).toSet
    val hasTitleCol = Seq("title", "headline", "article_title", "news_title").exists(lowerCols.contains)
    if (!hasTitleCol) {
      throw new IllegalArgumentException(
        s"Invalid dataset schema: missing a 'title' or 'headline' column. Found columns: ${rawDf.columns.mkString(", ")}"
      )
    }

    val normalizedInputDf = rawDf.select(
      resolveColumn(rawDf, Seq("title", "headline", "article_title", "news_title"), lit(null).cast(StringType)).as("raw_title"),
      resolveColumn(rawDf, Seq("description", "summary", "content", "snippet", "body"), lit("")).as("raw_description"),
      resolveColumn(rawDf, Seq("url", "link", "article_url"), lit("")).as("raw_url"),
      resolveColumn(rawDf, Seq("source", "domain", "publisher", "source_name"), lit("Unknown Source")).as("raw_source"),
      resolveColumn(rawDf, Seq("country", "sourcecountry", "country_code", "location"), lit("Global")).as("raw_country"),
      resolveColumn(rawDf, Seq("published_at", "seendate", "date", "timestamp", "published_date", "datetime"), lit(null).cast(StringType)).as("raw_published_at"),
      resolveColumn(rawDf, Seq("category", "topic", "section"), lit("")).as("raw_category"),
      resolveColumn(rawDf, Seq("tone", "sentiment"), lit("0.0")).as("raw_tone")
    )

    println("[STAGE 2/6] Data Cleaning, Timestamp Parsing & Deduplication...")
    val normalizeCountryUdf = udf((countryRaw: String) => {
      if (countryRaw == null || countryRaw.trim.isEmpty) "Global"
      else {
        val c = countryRaw.trim
        CountryNormalizationMap.getOrElse(c.toLowerCase, if (c.length <= 3) c.toUpperCase else c)
      }
    })

    val parsedDf = normalizedInputDf
      .withColumn("title", trim(regexp_replace(coalesce($"raw_title", lit("")), "\\s+", " ")))
      .withColumn("description", trim(regexp_replace(coalesce($"raw_description", lit("")), "\\s+", " ")))
      .withColumn("url", trim(coalesce($"raw_url", lit(""))))
      .withColumn("source", when(length(trim(coalesce($"raw_source", lit("")))) === 0, lit("Unknown Source")).otherwise(trim($"raw_source")))
      .withColumn("country", normalizeCountryUdf($"raw_country"))
      .withColumn("tone", coalesce($"raw_tone".cast(DoubleType), lit(0.0)))
      .withColumn(
        "event_timestamp",
        coalesce(
          to_timestamp($"raw_published_at", "yyyy-MM-dd'T'HH:mm:ss'Z'"),
          to_timestamp($"raw_published_at", "yyyy-MM-dd'T'HH:mm:ss"),
          to_timestamp($"raw_published_at", "yyyy-MM-dd HH:mm:ss"),
          to_timestamp($"raw_published_at", "yyyyMMddHHmmss"),
          to_timestamp($"raw_published_at", "yyyyMMdd'T'HHmmss'Z'"),
          to_timestamp($"raw_published_at", "yyyy-MM-dd"),
          to_timestamp($"raw_published_at")
        )
      )

    val validRowsDf = parsedDf.filter(length($"title") >= 5 && $"event_timestamp".isNotNull)
    val validCount = validRowsDf.count()
    val invalidDropped = rawCount - validCount

    if (validCount == 0) {
      throw new IllegalArgumentException(
        "No valid news records remained after data cleaning. Ensure 'title' and 'published_at' (ISO or YYYY-MM-DD HH:MM:SS) contain valid values."
      )
    }

    val withDedupKeysDf = validRowsDf
      .withColumn("norm_title", lower(regexp_replace($"title", "[^a-zA-Z0-9 ]", "")))
      .withColumn("dedup_url", when(length($"url") > 0, lower($"url")).otherwise(concat(lit("title:"), $"norm_title")))

    val dedupedDf = withDedupKeysDf
      .dropDuplicates("dedup_url")
      .dropDuplicates("norm_title")
      .drop("norm_title", "dedup_url", "raw_title", "raw_description", "raw_url", "raw_source", "raw_country", "raw_published_at", "raw_tone")

    println("[STAGE 3/6] News Categorization via Scala Spark UDF...")
    val categorizeUdf = udf((title: String, desc: String, existingCat: String) =>
      NewsCategorizer.categorize(title, desc, existingCat)
    )

    val cleanedDf = dedupedDf
      .withColumn("category", categorizeUdf($"title", $"description", $"raw_category"))
      .drop("raw_category")
      .withColumn("event_date", date_format($"event_timestamp", "yyyy-MM-dd"))
      .withColumn("event_hour", date_format($"event_timestamp", "yyyy-MM-dd HH:00"))
      .withColumn("published_iso", date_format($"event_timestamp", "yyyy-MM-dd'T'HH:mm:ss'Z'"))
      .cache()

    val cleanedCount = cleanedDf.count()
    val duplicatesRemoved = validCount - cleanedCount
    cleanedDf.createOrReplaceTempView("news_articles")

    println("[STAGE 4/6] Trend Analysis via Spark SQL...")
    val categoryDistDf = spark.sql(
      s"""
         |SELECT
         |  category,
         |  COUNT(*) AS article_count,
         |  ROUND(COUNT(*) * 100.0 / $cleanedCount, 2) AS share_pct,
         |  ROUND(AVG(tone), 3) AS avg_tone
         |FROM news_articles
         |GROUP BY category
         |ORDER BY article_count DESC
         |""".stripMargin
    )

    val countryDistDf = spark.sql(
      """
        |WITH country_cat AS (
        |  SELECT country, category, COUNT(*) AS cat_count,
        |    ROW_NUMBER() OVER (PARTITION BY country ORDER BY COUNT(*) DESC, category ASC) AS rn
        |  FROM news_articles
        |  GROUP BY country, category
        |),
        |country_totals AS (
        |  SELECT country, COUNT(*) AS article_count, ROUND(AVG(tone), 3) AS avg_tone
        |  FROM news_articles
        |  GROUP BY country
        |)
        |SELECT t.country, t.article_count, t.avg_tone, c.category AS top_category
        |FROM country_totals t
        |JOIN country_cat c ON t.country = c.country AND c.rn = 1
        |ORDER BY t.article_count DESC
        |""".stripMargin
    )

    val sourceDistDf = spark.sql(
      s"""
        |WITH source_cat AS (
        |  SELECT source, category, COUNT(*) AS cat_count,
        |    ROW_NUMBER() OVER (PARTITION BY source ORDER BY COUNT(*) DESC, category ASC) AS rn
        |  FROM news_articles
        |  GROUP BY source, category
        |),
        |source_totals AS (
        |  SELECT source, COUNT(*) AS article_count,
        |    ROUND(COUNT(*) * 100.0 / $cleanedCount, 2) AS share_pct,
        |    ROUND(AVG(tone), 3) AS avg_tone
        |  FROM news_articles
        |  GROUP BY source
        |)
        |SELECT t.source, t.article_count, t.share_pct, t.avg_tone, c.category AS top_category
        |FROM source_totals t
        |JOIN source_cat c ON t.source = c.source AND c.rn = 1
        |ORDER BY t.article_count DESC
        |""".stripMargin
    )

    val dailyActivityDf = spark.sql(
      """
        |SELECT event_date, COUNT(*) AS article_count, ROUND(AVG(tone), 3) AS avg_tone
        |FROM news_articles
        |GROUP BY event_date
        |ORDER BY event_date ASC
        |""".stripMargin
    )

    val categoryHourlyHeatmapDf = spark.sql(
      """
        |SELECT category, event_hour, COUNT(*) AS article_count
        |FROM news_articles
        |GROUP BY category, event_hour
        |ORDER BY event_hour ASC, category ASC
        |""".stripMargin
    )

    val hourlyActivityDf = spark.sql(
      """
        |WITH hour_cat AS (
        |  SELECT event_hour, category, COUNT(*) AS cat_count,
        |    ROW_NUMBER() OVER (PARTITION BY event_hour ORDER BY COUNT(*) DESC, category ASC) AS rn
        |  FROM news_articles
        |  GROUP BY event_hour, category
        |),
        |hour_totals AS (
        |  SELECT event_hour, COUNT(*) AS article_count, ROUND(AVG(tone), 3) AS avg_tone
        |  FROM news_articles
        |  GROUP BY event_hour
        |)
        |SELECT t.event_hour, t.article_count, t.avg_tone, c.category AS dominant_category
        |FROM hour_totals t
        |JOIN hour_cat c ON t.event_hour = c.event_hour AND c.rn = 1
        |ORDER BY t.event_hour ASC
        |""".stripMargin
    )

    val stopWordsList = StopWords.toSeq
    val keywordsDf = cleanedDf
      .select($"event_hour", $"category", explode(split(lower(regexp_replace($"title", "[^a-zA-Z0-9 ]", " ")), "\\s+")).as("keyword"))
      .filter(length($"keyword") >= 4 && !$"keyword".isin(stopWordsList: _*) && !$"keyword".rlike("^[0-9]+$"))

    keywordsDf.createOrReplaceTempView("news_keywords")

    val trendingTopicsDf = spark.sql(
      """
        |WITH kw_cat AS (
        |  SELECT keyword, category, COUNT(*) AS cat_mentions,
        |    ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY COUNT(*) DESC, category ASC) AS rn
        |  FROM news_keywords
        |  GROUP BY keyword, category
        |),
        |kw_totals AS (
        |  SELECT keyword, COUNT(*) AS mentions
        |  FROM news_keywords
        |  GROUP BY keyword
        |)
        |SELECT t.keyword AS topic, t.mentions, c.category AS primary_category
        |FROM kw_totals t
        |JOIN kw_cat c ON t.keyword = c.keyword AND c.rn = 1
        |ORDER BY t.mentions DESC, t.keyword ASC
        |LIMIT 30
        |""".stripMargin
    )

    // Top 3 keywords per hour so anomaly alerts automatically report related trending terms
    val hourlyKeywordsDf = spark.sql(
      """
        |WITH hkw AS (
        |  SELECT event_hour, keyword, COUNT(*) AS cnt,
        |    ROW_NUMBER() OVER (PARTITION BY event_hour ORDER BY COUNT(*) DESC, keyword ASC) AS rn
        |  FROM news_keywords
        |  GROUP BY event_hour, keyword
        |)
        |SELECT event_hour, concat_ws(', ', collect_list(keyword)) AS top_keywords
        |FROM hkw
        |WHERE rn <= 3
        |GROUP BY event_hour
        |""".stripMargin
    )

    println("[STAGE 5/6] Statistical Anomaly Detection (Z-Score & 6h Rolling Avg)...")
    val hourlyBucketCount = hourlyActivityDf.count()
    val insufficientData = hourlyBucketCount < 3

    val rollingWindow = Window.orderBy($"event_hour".asc).rowsBetween(-6, -1)
    val globalStats = hourlyActivityDf.agg(
      avg($"article_count").as("global_mean"),
      stddev_pop($"article_count").as("global_stddev"),
      min($"article_count").as("min_hourly"),
      max($"article_count").as("max_hourly")
    ).first()

    val globalMean   = Option(globalStats.getAs[Double]("global_mean")).getOrElse(0.0)
    val globalStddev = Option(globalStats.getAs[Double]("global_stddev")).getOrElse(0.0)
    val minHourly    = Option(globalStats.getAs[Long]("min_hourly")).getOrElse(0L)
    val maxHourly    = Option(globalStats.getAs[Long]("max_hourly")).getOrElse(0L)
    val zeroStddev   = globalStddev <= 1e-9

    val hourlyJoinedDf = hourlyActivityDf.join(hourlyKeywordsDf, Seq("event_hour"), "left")
      .withColumn("top_keywords", coalesce($"top_keywords", lit("general coverage")))

    val hourlyWithStatsDf = hourlyJoinedDf
      .withColumn("rolling_avg", coalesce(round(avg($"article_count").over(rollingWindow), 2), round(lit(globalMean), 2)))
      .withColumn("global_mean", round(lit(globalMean), 2))
      .withColumn("global_stddev", round(lit(globalStddev), 2))
      .withColumn(
        "z_score",
        if (zeroStddev || insufficientData) lit(0.0)
        else round(($"article_count" - lit(globalMean)) / lit(globalStddev), 3)
      )
      .withColumn(
        "spike_ratio",
        when($"rolling_avg" > 0.0, round($"article_count" / $"rolling_avg", 2))
          .otherwise(lit(1.0))
      )
      .withColumn(
        "is_anomaly",
        if (zeroStddev || insufficientData) lit(false)
        else ($"z_score" >= zThreshold) || ($"z_score" >= Math.max(1.2, zThreshold - 0.35) && $"spike_ratio" >= 1.75)
      )
      .withColumn(
        "severity",
        when($"is_anomaly" === false, lit("NORMAL"))
          .when($"z_score" >= zThreshold + 1.0, lit("CRITICAL"))
          .when($"z_score" >= zThreshold, lit("HIGH"))
          .otherwise(lit("MEDIUM"))
      )
      .withColumn(
        "alert_message",
        when(
          $"is_anomaly",
          concat(
            lit("Unusual volume spike in "), $"dominant_category",
            lit(" coverage: "), $"article_count".cast(StringType),
            lit(" articles/hr (Z="), $"z_score".cast(StringType),
            lit(", "), $"spike_ratio".cast(StringType), lit("x 6h rolling avg)")
          )
        ).otherwise(
          if (insufficientData) lit("Insufficient hourly intervals (<3) for Z-score anomaly classification")
          else if (zeroStddev) lit("Uniform hourly volume (StdDev = 0); no statistical deviations")
          else lit("Baseline publication volume within normal statistical bounds")
        )
      )
      .withColumn(
        "alert_explanation",
        when(
          $"is_anomaly",
          concat(
            lit("Hourly volume X="), $"article_count".cast(StringType),
            lit(" exceeded dataset mean ("), $"global_mean".cast(StringType),
            lit(") by Z="), $"z_score".cast(StringType),
            lit(" standard deviations (StdDev="), $"global_stddev".cast(StringType),
            lit(") and reached "), $"spike_ratio".cast(StringType),
            lit("x the trailing 6-hour rolling baseline ("), $"rolling_avg".cast(StringType),
            lit("). Dominant category: "), $"dominant_category",
            lit("; leading terms: "), $"top_keywords",
            lit(". Note: This flags an unusual surge in publication activity only and does not verify event truth.")
          )
        ).otherwise(lit("No anomaly triggered."))
      )
      .cache()

    val anomaliesOnlyDf = hourlyWithStatsDf
      .filter($"is_anomaly" === true)
      .orderBy($"z_score".desc, $"event_hour".desc)

    val anomalyCount = anomaliesOnlyDf.count()

    // -------------------------------------------------------------------------
    // STAGE 5B: News Spike Detective (Moderate / High / Critical Surge Analysis)
    // -------------------------------------------------------------------------
    val moderateThreshold = Math.max(1.15, zThreshold - 0.5)
    val newsSpikesAllDf = hourlyWithStatsDf
      .withColumn("spike_date", substring($"event_hour", 1, 10))
      .withColumn("spike_time", concat(substring($"event_hour", 12, 5), lit(" UTC")))
      .withColumn("previous_avg", $"rolling_avg")
      .withColumn("current_volume", $"article_count")
      .withColumn(
        "pct_increase",
        when($"previous_avg" > 0.0, round((($"current_volume" - $"previous_avg") / $"previous_avg") * 100.0, 1))
          .otherwise(lit(0.0))
      )
      .withColumn(
        "spike_severity",
        if (zeroStddev || insufficientData) lit("Normal")
        else
          when($"z_score" >= zThreshold + 1.0, lit("Critical"))
            .when($"z_score" >= zThreshold, lit("High"))
            .when($"z_score" >= moderateThreshold && $"pct_increase" >= 50.0, lit("Moderate"))
            .otherwise(lit("Normal"))
      )
      .withColumn("is_spike", $"spike_severity" =!= lit("Normal"))
      .withColumn("responsible_category", $"dominant_category")
      .withColumn("responsible_keywords", $"top_keywords")
      .withColumn(
        "spike_summary",
        concat(
          $"spike_severity", lit(" spike in "), $"responsible_category",
          lit(": +"), $"pct_increase".cast(StringType),
          lit("% ("), $"previous_avg".cast(StringType), lit(" -> "), $"current_volume".cast(StringType),
          lit(" articles, Z="), $"z_score".cast(StringType), lit(")")
        )
      )
      .cache()

    val newsSpikesDf = newsSpikesAllDf
      .filter($"is_spike" === true)
      .select(
        "event_hour", "spike_date", "spike_time", "current_volume", "previous_avg",
        "pct_increase", "z_score", "spike_severity", "responsible_category",
        "responsible_keywords", "spike_summary"
      )
      .orderBy($"z_score".desc, $"pct_increase".desc)

    val totalNewsSpikes = newsSpikesDf.count()
    val highestSpikeCategory = newsSpikesDf.take(1).headOption
      .map(_.getAs[String]("responsible_category"))
      .getOrElse("None")

    // -------------------------------------------------------------------------
    // STAGE 5C: Topic Explosion Tracker (Spark SQL Sliding Window Growth)
    // -------------------------------------------------------------------------
    val insufficientTopicHistory = hourlyBucketCount < 3

    // Build chronological integer index across all observed hourly buckets
    val hourIndexDf = hourlyActivityDf
      .select($"event_hour")
      .distinct()
      .withColumn("hour_idx", row_number().over(Window.orderBy($"event_hour".asc)))

    hourIndexDf.createOrReplaceTempView("hour_index_map")

    val topicExplosionsDf = if (insufficientTopicHistory) {
      Seq.empty[(String, String, Long, Long, Double, Long, String, String, String)].toDF(
        "topic", "primary_category", "previous_count", "current_count",
        "growth_pct", "total_mentions", "started_increasing_at", "peak_hour", "explosion_status"
      )
    } else {
      spark.sql(
        """
          |WITH kw_primary AS (
          |  SELECT keyword, category, COUNT(*) AS cat_cnt,
          |    ROW_NUMBER() OVER (PARTITION BY keyword ORDER BY COUNT(*) DESC, category ASC) AS rn
          |  FROM news_keywords
          |  GROUP BY keyword, category
          |),
          |kw_totals AS (
          |  SELECT keyword, COUNT(*) AS total_mentions
          |  FROM news_keywords
          |  GROUP BY keyword
          |  HAVING COUNT(*) >= 3
          |),
          |kw_hourly AS (
          |  SELECT k.keyword, h.event_hour, h.hour_idx, COUNT(*) AS mentions
          |  FROM news_keywords k
          |  JOIN hour_index_map h ON k.event_hour = h.event_hour
          |  GROUP BY k.keyword, h.event_hour, h.hour_idx
          |),
          |kw_windows AS (
          |  SELECT
          |    keyword,
          |    event_hour,
          |    hour_idx,
          |    mentions,
          |    SUM(mentions) OVER (PARTITION BY keyword ORDER BY hour_idx RANGE BETWEEN 2 PRECEDING AND CURRENT ROW) AS current_count,
          |    COALESCE(SUM(mentions) OVER (PARTITION BY keyword ORDER BY hour_idx RANGE BETWEEN 8 PRECEDING AND 3 PRECEDING), 0) AS previous_count,
          |    MIN(event_hour) OVER (PARTITION BY keyword ORDER BY hour_idx RANGE BETWEEN 2 PRECEDING AND CURRENT ROW) AS window_start_hour
          |  FROM kw_hourly
          |),
          |kw_scored AS (
          |  SELECT
          |    w.keyword,
          |    w.event_hour AS peak_hour,
          |    w.window_start_hour AS started_increasing_at,
          |    w.previous_count,
          |    w.current_count,
          |    CASE
          |      WHEN w.previous_count > 0 THEN ROUND(((w.current_count - w.previous_count) * 100.0) / w.previous_count, 1)
          |      ELSE ROUND(w.current_count * 100.0, 1)
          |    END AS growth_pct,
          |    ROW_NUMBER() OVER (
          |      PARTITION BY w.keyword
          |      ORDER BY (w.current_count - w.previous_count) DESC, w.current_count DESC, w.hour_idx DESC
          |    ) AS surge_rn
          |  FROM kw_windows w
          |)
          |SELECT
          |  s.keyword AS topic,
          |  p.category AS primary_category,
          |  s.previous_count,
          |  s.current_count,
          |  s.growth_pct,
          |  t.total_mentions,
          |  s.started_increasing_at,
          |  s.peak_hour,
          |  CASE
          |    WHEN s.previous_count = 0 THEN 'Emerging Surge'
          |    WHEN s.growth_pct >= 300.0 THEN 'Explosive'
          |    WHEN s.growth_pct >= 150.0 THEN 'Rapid Growth'
          |    ELSE 'Accelerating'
          |  END AS explosion_status
          |FROM kw_scored s
          |JOIN kw_totals t ON s.keyword = t.keyword
          |JOIN kw_primary p ON s.keyword = p.keyword AND p.rn = 1
          |WHERE s.surge_rn = 1 AND s.current_count >= 2 AND s.current_count > s.previous_count
          |ORDER BY s.growth_pct DESC, s.current_count DESC, t.total_mentions DESC, s.keyword ASC
          |LIMIT 25
          |""".stripMargin
      ).cache()
    }

    val rapidlyGrowingTopicsCount = topicExplosionsDf.count()
    val mostExplosiveTopic = topicExplosionsDf.take(1).headOption
      .map(_.getAs[String]("topic"))
      .getOrElse("None")

    val topExplosiveNames = topicExplosionsDf.select($"topic").limit(10).as[String].collect().toSeq
    val topicTimelineDf = if (topExplosiveNames.isEmpty) {
      Seq.empty[(String, String, Long)].toDF("topic", "event_hour", "mentions")
    } else {
      keywordsDf
        .filter($"keyword".isin(topExplosiveNames: _*))
        .groupBy($"keyword".as("topic"), $"event_hour")
        .agg(count("*").as("mentions"))
        .orderBy($"event_hour".asc, $"topic".asc)
    }

    println("[STAGE 6/6] Exporting Parquet, CSV & Statistical Summary...")
    val parquetDir = s"$outputBaseDir/parquet"
    val csvDir     = s"$outputBaseDir/csv"

    cleanedDf
      .select("title", "description", "url", "source", "country", "category", "tone", "published_iso", "event_date", "event_hour")
      .coalesce(1)
      .write.mode("overwrite").parquet(s"$parquetDir/cleaned_articles")

    hourlyWithStatsDf.coalesce(1).write.mode("overwrite").parquet(s"$parquetDir/hourly_trends")
    anomaliesOnlyDf.coalesce(1).write.mode("overwrite").parquet(s"$parquetDir/anomalies")
    newsSpikesDf.coalesce(1).write.mode("overwrite").parquet(s"$parquetDir/news_spikes")
    topicExplosionsDf.coalesce(1).write.mode("overwrite").parquet(s"$parquetDir/topic_explosions")

    cleanedDf
      .select("title", "description", "url", "source", "country", "category", "tone", "published_iso", "event_date", "event_hour")
      .coalesce(1)
      .write.mode("overwrite").option("header", "true").csv(s"$csvDir/cleaned_articles")

    categoryDistDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/category_distribution")
    countryDistDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/country_distribution")
    sourceDistDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/source_distribution")
    dailyActivityDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/daily_activity")
    categoryHourlyHeatmapDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/category_hourly_heatmap")
    hourlyWithStatsDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/hourly_activity")
    trendingTopicsDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/trending_topics")
    anomaliesOnlyDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/anomaly_alerts")
    newsSpikesDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/news_spikes")
    topicExplosionsDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/topic_explosions")
    topicTimelineDf.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/topic_timeline")

    val dateBoundsRow = cleanedDf.agg(min($"published_iso").as("min_ts"), max($"published_iso").as("max_ts")).first()
    val minTs = Option(dateBoundsRow.getAs[String]("min_ts")).getOrElse("")
    val maxTs = Option(dateBoundsRow.getAs[String]("max_ts")).getOrElse("")

    val durationMs = System.currentTimeMillis() - startTimeMs
    val topCategory = categoryDistDf.take(1).headOption.map(_.getAs[String]("category")).getOrElse("None")
    val topTopic = trendingTopicsDf.take(1).headOption.map(_.getAs[String]("topic")).getOrElse("None")
    val distinctCountries = countryDistDf.count()
    val distinctSources = sourceDistDf.count()

    val statRows = Seq(
      ("raw_records_received", rawCount.toString),
      ("invalid_records_dropped", invalidDropped.toString),
      ("duplicate_records_removed", duplicatesRemoved.toString),
      ("cleaned_articles_output", cleanedCount.toString),
      ("distinct_countries", distinctCountries.toString),
      ("distinct_sources", distinctSources.toString),
      ("hourly_buckets_analyzed", hourlyBucketCount.toString),
      ("hourly_volume_mean", BigDecimal(globalMean).setScale(3, BigDecimal.RoundingMode.HALF_UP).toString()),
      ("hourly_volume_stddev", BigDecimal(globalStddev).setScale(3, BigDecimal.RoundingMode.HALF_UP).toString()),
      ("hourly_volume_min", minHourly.toString),
      ("hourly_volume_max", maxHourly.toString),
      ("z_score_threshold", zThreshold.toString),
      ("anomalies_detected", anomalyCount.toString),
      ("total_news_spikes", totalNewsSpikes.toString),
      ("rapidly_growing_topics", rapidlyGrowingTopicsCount.toString),
      ("highest_spike_category", highestSpikeCategory),
      ("most_explosive_topic", mostExplosiveTopic),
      ("insufficient_data_flag", insufficientData.toString),
      ("zero_stddev_flag", zeroStddev.toString),
      ("top_category", topCategory),
      ("top_trending_topic", topTopic),
      ("earliest_article_utc", minTs),
      ("latest_article_utc", maxTs),
      ("processing_time_ms", durationMs.toString)
    ).toDF("metric", "value")
    statRows.coalesce(1).write.mode("overwrite").option("header", "true").csv(s"$csvDir/statistical_summary")

    val statusNote =
      if (insufficientData) "Insufficient hourly intervals (<3) for reliable Z-score anomaly detection."
      else if (zeroStddev) "Standard deviation is zero across hourly intervals; no statistical anomalies flagged."
      else "Statistical anomaly detection completed normally."

    val summaryJson =
      s"""{
         |  "status": "success",
         |  "engine": "Apache Spark ${spark.version} (Scala 2.12)",
         |  "inputFile": "${escapeJson(inputCsvPath)}",
         |  "outputDir": "${escapeJson(outputBaseDir)}",
         |  "rawCount": $rawCount,
         |  "invalidDropped": $invalidDropped,
         |  "duplicatesRemoved": $duplicatesRemoved,
         |  "cleanedCount": $cleanedCount,
         |  "distinctCountries": $distinctCountries,
         |  "distinctSources": $distinctSources,
         |  "hourlyBuckets": $hourlyBucketCount,
         |  "topCategory": "${escapeJson(topCategory)}",
         |  "topTopic": "${escapeJson(topTopic)}",
         |  "anomalyCount": $anomalyCount,
         |  "totalNewsSpikes": $totalNewsSpikes,
         |  "rapidlyGrowingTopics": $rapidlyGrowingTopicsCount,
         |  "highestSpikeCategory": "${escapeJson(highestSpikeCategory)}",
         |  "mostExplosiveTopic": "${escapeJson(mostExplosiveTopic)}",
         |  "insufficientTopicHistory": $insufficientTopicHistory,
         |  "zThreshold": $zThreshold,
         |  "globalHourlyMean": ${BigDecimal(globalMean).setScale(2, BigDecimal.RoundingMode.HALF_UP)},
         |  "globalHourlyStddev": ${BigDecimal(globalStddev).setScale(2, BigDecimal.RoundingMode.HALF_UP)},
         |  "minHourlyVolume": $minHourly,
         |  "maxHourlyVolume": $maxHourly,
         |  "insufficientData": $insufficientData,
         |  "zeroStddev": $zeroStddev,
         |  "statusNote": "${escapeJson(statusNote)}",
         |  "earliestArticle": "${escapeJson(minTs)}",
         |  "latestArticle": "${escapeJson(maxTs)}",
         |  "processingTimeMs": $durationMs,
         |  "processedAt": "${java.time.Instant.now().toString}"
         |}""".stripMargin

    val outDirFile = new File(outputBaseDir)
    if (!outDirFile.exists()) outDirFile.mkdirs()
    val writer = new PrintWriter(new File(outDirFile, "pipeline_summary.json"), StandardCharsets.UTF_8.name())
    try {
      writer.write(summaryJson)
    } finally {
      writer.close()
    }

    println(s"NewsPulse Spark Job completed in ${durationMs}ms: $cleanedCount cleaned articles, $anomalyCount anomalies detected.")
  }

  private def escapeJson(s: String): String = {
    if (s == null) ""
    else s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r")
  }
}
