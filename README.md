# NewsPulse — Large-Scale News Media Data Processing & Intelligent Trend & Anomaly Detection

NewsPulse is an end-to-end Big Data mini-project built with **Scala**, **Apache Spark / Spark SQL**, **Apache Parquet & CSV**, **GDELT 2.0 API**, **Python + Streamlit + Plotly**, and a **full-stack React + Express Web Dashboard** on port `3000`.

---

## Architecture & Pipeline

1. **News Collection (`collector/gdelt_collector.py`)**
   - Queries the live GDELT 2.0 DOC API (`sourcelang:eng`) and exports normalized CSV feeds.
   - Also supports direct CSV dataset uploads and included sample datasets (`data/raw/`).
2. **Data Cleaning & Preprocessing (`spark-processor/src/main/scala/com/newspulse/NewsPulseJob.scala`)**
   - Normalizes heterogeneous column names (`title`/`headline`, `published_at`/`seendate`/`date`, `country`/`sourcecountry`).
   - Parses multiple timestamp formats into UTC `TimestampType`, imputes missing metadata, standardizes country codes, filters invalid records, and removes duplicates by normalized URL and headline.
3. **News Categorization (`spark-processor/src/main/scala/com/newspulse/NewsCategorizer.scala`)**
   - Registers a Scala Spark UDF (`categorize_news`) to classify every article into 8 domains:
     `Technology`, `Business`, `Politics`, `Sports`, `Health`, `Science`, `Entertainment`, `World News`.
4. **Trend Analysis (`Spark SQL`)**
   - Computes category distributions, country-wise analytics, hourly/daily activity, and top trending keywords via Spark SQL tokenization (`explode(split(...))` with stop-word removal).
5. **Statistical Anomaly Detection (`Spark Window Functions`)**
   - Computes hourly global mean ($\mu$), standard deviation ($\sigma$), 6-hour trailing rolling average, Z-score ($Z = \frac{x - \mu}{\sigma}$), and spike ratio.
   - Flags surges exceeding the configurable Z-score threshold (`CRITICAL`, `HIGH`, `MEDIUM`) with human-readable alerts.
6. **Dual Storage & Interactive Visualization**
   - Writes Apache Parquet datasets (`data/processed/parquet/`) and CSV reports (`data/processed/csv/`), plus `pipeline_summary.json`.
   - Visualized through both the **Python Streamlit + Plotly Dashboard** (`streamlit_app/app.py`) and the **Web Dashboard** (`server.ts` + `src/`).

---

## Project Structure

```text
newspulse/
├── collector/
│   └── gdelt_collector.py          # Live GDELT 2.0 DOC API news collector
├── data/
│   ├── raw/
│   │   ├── sample_global_news.csv  # 177-row multi-country sample with anomalies & duplicates
│   │   ├── sample_tech_surge.csv   # 87-row technology surge test dataset
│   │   └── sample_invalid.csv      # Invalid schema test file for error handling
│   └── processed/                  # Spark-generated Parquet, CSV & pipeline_summary.json
├── scripts/
│   ├── build_spark.sh              # Compiles Scala classes against Spark JARs into newspulse-spark.jar
│   └── generate_samples.py         # Reproducible sample CSV dataset generator
├── spark-processor/
│   ├── build.sbt                   # SBT project definition (Scala 2.12.18, Spark 3.5.1)
│   ├── dist/newspulse-spark.jar    # Compiled Spark application JAR
│   └── src/main/scala/com/newspulse/
│       ├── NewsCategorizer.scala   # 8-category Scala UDF classifier
│       └── NewsPulseJob.scala      # Core Apache Spark & Spark SQL pipeline
├── streamlit_app/
│   ├── .streamlit/config.toml      # Dark navy/charcoal Streamlit theme
│   ├── app.py                      # Streamlit + Plotly dashboard reading Spark outputs
│   └── requirements.txt            # streamlit, plotly, pyarrow, requests
├── server.ts                       # Express backend invoking spark-submit & serving port 3000
└── src/                            # React + Plotly.js web dashboard UI
```

---

## Local Setup & Execution

### 1. Prerequisites
- **Java 17** (`openjdk-17-jdk-headless`)
- **Scala 2.12.18** & **Apache Spark 3.5.1** (`SPARK_HOME=/opt/spark`)
- **Python 3.10+** (`pip install -r streamlit_app/requirements.txt`)
- **Node.js 20+** (`npm install`)

### 2. Compile the Scala Apache Spark Application
```bash
bash scripts/build_spark.sh
```
*(Alternatively, build with `cd spark-processor && sbt package`.)*

### 3. Run the Apache Spark Pipeline Manually
```bash
spark-submit \
  --master "local[*]" \
  --class com.newspulse.NewsPulseJob \
  spark-processor/dist/newspulse-spark.jar \
  data/raw/sample_global_news.csv \
  data/processed \
  1.8
```

### 4. Collect Live News from GDELT (Optional)
```bash
python3 collector/gdelt_collector.py \
  --query "(technology OR climate OR economy)" \
  --max-records 120 \
  --output data/raw/gdelt_live.csv
```

### 5. Launch the Dashboards

**Option A — Streamlit + Plotly Dashboard (Python):**
```bash
streamlit run streamlit_app/app.py
```

**Option B — Full-Stack Web Dashboard (Port 3000):**
```bash
npm run dev
```
Open `http://localhost:3000` to run Spark jobs, upload custom CSV datasets, fetch live GDELT streams, inspect Plotly visualizations, and download CSV/Parquet reports.
