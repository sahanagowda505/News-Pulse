#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPARK_DIR="$ROOT_DIR/spark-processor"
BUILD_CLASSES="$SPARK_DIR/target/classes"
DIST_JAR="$SPARK_DIR/dist/newspulse-spark.jar"

SPARK_HOME="${SPARK_HOME:-/opt/spark}"
if [ ! -d "$SPARK_HOME/jars" ]; then
  echo "ERROR: Apache Spark jars directory not found at $SPARK_HOME/jars" >&2
  exit 1
fi

rm -rf "$BUILD_CLASSES"
mkdir -p "$BUILD_CLASSES" "$SPARK_DIR/dist"

# Build classpath from Apache Spark's Scala 2.12 jars
SPARK_CP=$(find "$SPARK_HOME/jars" -name "*.jar" | tr '\n' ':')

echo "Compiling NewsPulse Scala Spark sources..."
scalac -classpath "$SPARK_CP" -d "$BUILD_CLASSES" \
  "$SPARK_DIR/src/main/scala/com/newspulse/NewsCategorizer.scala" \
  "$SPARK_DIR/src/main/scala/com/newspulse/NewsPulseJob.scala"

echo "Packaging $DIST_JAR..."
jar cf "$DIST_JAR" -C "$BUILD_CLASSES" .

echo "Successfully built $DIST_JAR"
