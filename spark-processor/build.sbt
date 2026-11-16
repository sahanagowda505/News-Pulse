name := "newspulse-spark"

version := "1.0.0"

scalaVersion := "2.12.18"

val sparkVersion = "3.5.1"

libraryDependencies ++= Seq(
  "org.apache.spark" %% "spark-core" % sparkVersion % "provided",
  "org.apache.spark" %% "spark-sql"  % sparkVersion % "provided"
)

// Ensure clean fat/package JAR output for spark-submit
Compile / mainClass := Some("com.newspulse.NewsPulseJob")
