package com.newspulse

/**
 * NewsCategorizer
 * ----------------
 * Deterministic, keyword-weighted news classifier for Spark UDF usage.
 * Categorizes articles into the 8 canonical NewsPulse domains:
 *   Technology, Business, Politics, Sports, Health, Science, Entertainment, World News
 */
object NewsCategorizer extends Serializable {

  val ValidCategories: Set[String] = Set(
    "Technology",
    "Business",
    "Politics",
    "Sports",
    "Health",
    "Science",
    "Entertainment",
    "World News"
  )

  private val categoryKeywords: Map[String, Seq[String]] = Map(
    "Technology" -> Seq(
      "ai", "artificial intelligence", "software", "semiconductor", "chip", "gpu",
      "cloud", "cybersecurity", "hacker", "data breach", "startup", "tech", "robot",
      "robotics", "quantum", "5g", "smartphone", "app", "algorithm", "openai", "google",
      "microsoft", "apple", "nvidia", "meta", "server", "blockchain", "automation",
      "developer", "computing", "internet", "digital", "model", "llm", "outage"
    ),
    "Business" -> Seq(
      "market", "stock", "stocks", "inflation", "interest rate", "central bank",
      "federal reserve", "rbi", "ecb", "gdp", "revenue", "earnings", "merger",
      "acquisition", "ipo", "bank", "banking", "investment", "investor", "trade",
      "economy", "economic", "export", "import", "retail", "supply chain",
      "quarterly", "profit", "wall street", "nasdaq", "sensex", "nifty", "conglomerate"
    ),
    "Politics" -> Seq(
      "election", "parliament", "senate", "congress", "president", "prime minister",
      "minister", "government", "policy", "legislation", "vote", "campaign",
      "lawmaker", "bill", "cabinet", "white house", "referendum", "coalition",
      "subsidy", "reform", "regulatory"
    ),
    "Sports" -> Seq(
      "championship", "tournament", "world cup", "olympics", "football", "soccer",
      "cricket", "tennis", "nba", "nfl", "fifa", "premier league", "grand prix",
      "formula 1", "f1", "athlete", "stadium", "coach", "medal", "playoffs",
      "match", "goal", "ipl", "badminton", "basketball", "baseball", "victory", "grand slam"
    ),
    "Health" -> Seq(
      "vaccine", "hospital", "disease", "virus", "pandemic", "who", "medical",
      "medicine", "clinical trial", "therapy", "cancer", "diabetes", "mental health",
      "nutrition", "healthcare", "doctor", "patient", "drug", "fda", "public health",
      "outbreak", "surgery", "biotech", "pharmaceutical", "wellness", "cardiology", "immunization"
    ),
    "Science" -> Seq(
      "nasa", "space", "telescope", "planet", "exoplanet", "mars", "moon", "asteroid",
      "physics", "particle", "cern", "biology", "genetics", "genome", "crispr",
      "neuroscience", "astronomy", "rocket", "launch", "orbit", "researcher",
      "laboratory", "peer-reviewed", "university study", "discovery", "fossil", "fusion",
      "isro", "climate", "solar", "renewable", "emissions", "carbon", "coral", "ocean"
    ),
    "Entertainment" -> Seq(
      "movie", "film", "cinema", "box office", "oscar", "grammy", "music", "album",
      "concert", "festival", "streaming", "netflix", "television", "series", "actor",
      "actress", "director", "celebrity", "award", "broadway", "gaming", "esports",
      "trailer", "hollywood", "bollywood", "pop star", "theater"
    ),
    "World News" -> Seq(
      "diplomacy", "treaty", "united nations", "nato", "g20", "summit", "embassy",
      "geopolitics", "sanctions", "tariff", "border", "ceasefire", "peace talks",
      "foreign ministry", "international", "global", "maritime", "monsoon", "flood",
      "wildfire", "conservation", "amazon", "coastal", "eu", "indo-pacific"
    )
  )

  /**
   * Categorizes a news article using its existing category (if canonical or mapped)
   * or weighted keyword matching across title (weight 2) and description (weight 1).
   */
  def categorize(title: String, description: String, existingCategory: String): String = {
    if (existingCategory != null) {
      val trimmed = existingCategory.trim
      if (trimmed.equalsIgnoreCase("Environment")) return "World News"
      if (trimmed.equalsIgnoreCase("World")) return "World News"
      ValidCategories.find(_.equalsIgnoreCase(trimmed)) match {
        case Some(canonical) => return canonical
        case None            => // fall through to keyword classifier
      }
    }

    val safeTitle = if (title == null) "" else title.toLowerCase
    val safeDesc  = if (description == null) "" else description.toLowerCase

    var bestCategory = "World News"
    var bestScore    = 0

    categoryKeywords.foreach { case (category, keywords) =>
      var score = 0
      keywords.foreach { kw =>
        if (kw.length <= 3) {
          val pattern = s"\\b${java.util.regex.Pattern.quote(kw.trim)}\\b".r
          if (pattern.findFirstIn(safeTitle).isDefined) score += 3
          if (pattern.findFirstIn(safeDesc).isDefined) score += 1
        } else {
          if (safeTitle.contains(kw)) score += 2
          if (safeDesc.contains(kw)) score += 1
        }
      }
      if (score > bestScore) {
        bestScore = score
        bestCategory = category
      }
    }

    if (bestScore == 0) "World News" else bestCategory
  }
}
