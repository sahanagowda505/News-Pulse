"""
Sample Dataset Generator for NewsPulse
--------------------------------------
Generates realistic multi-country, multi-category news CSV datasets with:
  - Intentional duplicates & missing fields (to test Spark Data Cleaning)
  - Unlabeled categories (to test Spark News Categorization across 8 domains)
  - Controlled statistical volume surges (to test Z-Score & Rolling Avg Anomaly Detection)
"""

import csv
import os
import random
from datetime import datetime, timedelta

random.seed(42)

TEMPLATES = {
    "Technology": [
        ("OpenAI and Nvidia unveil next-generation AI inference cluster for enterprise cloud", "Tech companies expand GPU server infrastructure and AI model automation tools.", "TechCrunch", "US"),
        ("European semiconductor alliance approves 12B chip fabrication hub in Dresden", "New semiconductor wafer plant targets automotive and AI computing chips.", "Reuters", "DE"),
        ("Cybersecurity researchers patch critical zero-day vulnerability in cloud routers", "Enterprise security teams deploy firmware updates after data breach warning.", "Wired", "GB"),
        ("Bengaluru startup launches multilingual edge AI smartphone assistant", "Mobile computing developer team optimizes low-power neural algorithms.", "Economic Times", "IN"),
        ("Tokyo robotics consortium demonstrates autonomous warehouse logistics fleet", "Industrial automation robots coordinate using 5G private server networks.", "Nikkei Asia", "JP"),
    ],
    "Politics": [
        ("Parliament debates digital trade bill ahead of G20 ministerial summit", "Lawmakers review tariff proposals and cross-border policy frameworks.", "BBC News", "GB"),
        ("Senate committee advances bipartisan infrastructure legislation package", "Policy leaders negotiate funding allocations in Washington cabinet session.", "Associated Press", "US"),
        ("New Delhi hosts bilateral diplomacy talks on Indo-Pacific maritime treaty", "Prime minister meets foreign cabinet officials to sign trade agreement.", "The Hindu", "IN"),
        ("French parliament votes on regional energy subsidy reform bill", "Government coalition outlines legislative timeline ahead of spring session.", "Le Monde", "FR"),
        ("Canadian embassy announces updated visa policy for skilled researchers", "Foreign ministry coordinates international diplomatic mobility program.", "Globe and Mail", "CA"),
    ],
    "Sports": [
        ("Manchester City secures dramatic late victory in Premier League title clash", "Football stadium erupts as striker scores decisive stoppage-time goal.", "Sky Sports", "GB"),
        ("Indian cricket squad announces pace rotation strategy for Test championship", "Coach confirms athlete workload management ahead of five-match tournament.", "ESPN Cricinfo", "IN"),
        ("Formula 1 Grand Prix qualifying sees record lap times in wet conditions", "Motorsport teams adjust tire strategy ahead of Sunday championship race.", "Autosport", "DE"),
        ("NBA playoffs tip off with high-scoring overtime thriller in Boston", "Basketball franchise advances behind 42-point performance in conference series.", "ESPN", "US"),
        ("Australian Open tennis tournament introduces automated electronic line calling", "Grand Slam organizers expand court technology for upcoming championship.", "ABC News", "AU"),
    ],
    "Business": [
        ("Federal Reserve signals steady interest rate path amid cooling inflation data", "Wall Street stocks rally following quarterly consumer price index report.", "Bloomberg", "US"),
        ("Global semiconductor exports drive Q3 revenue surge across Asian markets", "Supply chain recovery lifts Nasdaq and Nikkei manufacturing stocks.", "Financial Times", "SG"),
        ("Indian banking sector posts 14 percent quarterly profit growth on retail credit", "RBI commentary highlights resilient domestic economic investment trends.", "Mint", "IN"),
        ("German industrial conglomerate announces spin-off of logistics division", "Merger and acquisition activity accelerates across European stock exchanges.", "Handelsblatt", "DE"),
        ("Major retail chains expand automated supply chain hubs before holiday quarter", "Corporate earnings outlook strengthens as freight costs stabilize.", "WSJ", "US"),
    ],
    "Health": [
        ("WHO releases updated clinical guidance on seasonal respiratory vaccine rollout", "Public health ministries expand hospital immunization clinics for vulnerable groups.", "Reuters", "CH"),
        ("Phase 3 clinical trial shows promising outcomes for targeted cancer immunotherapy", "Biotech researchers publish peer-reviewed medical therapy results.", "STAT News", "US"),
        ("National healthcare network deploys AI-assisted cardiology triage screening", "Hospital doctors report faster patient diagnostics in urban emergency wards.", "The Guardian", "GB"),
        ("Medical researchers identify early biomarker for metabolic diabetes prevention", "Nutrition and pharmaceutical teams collaborate on preventive wellness study.", "Times of India", "IN"),
        ("Japanese biotech firm receives regulatory approval for regenerative tissue drug", "Clinical medicine breakthrough targets chronic joint disease patients.", "Japan Times", "JP"),
    ],
    "Entertainment": [
        ("Animated sci-fi film tops global box office with 180M opening weekend", "Cinema chains report highest autumn theater attendance in five years.", "Variety", "US"),
        ("Toronto film festival announces international competition slate for 2026", "Directors and actors gather for premiere screenings and industry awards.", "Hollywood Reporter", "CA"),
        ("Global streaming platform commissions six regional drama series across Asia", "Television studio expands multi-language production investments.", "ScreenDaily", "KR"),
        ("Iconic rock band unveils 24-city stadium concert tour across Europe", "Live music festival promoters report record pre-sale ticket demand.", "NME", "GB"),
        ("Esports championship finals draw four million concurrent online viewers", "Competitive gaming tournament awards record prize pool in Seoul.", "IGN", "SG"),
    ],
    "Science": [
        ("NASA James Webb telescope captures high-resolution atmosphere of rocky exoplanet", "Astronomy team detects water vapor signatures in distant solar orbit.", "Space.com", "US"),
        ("CERN particle physics collaboration measures rare subatomic decay anomaly", "Laboratory physicists analyze high-energy collision datasets.", "Nature News", "FR"),
        ("ISRO completes static fire test for reusable heavy-lift orbital rocket stage", "Space agency advances next-generation satellite launch vehicle program.", "The Hindu", "IN"),
        ("University genetics lab refines CRISPR base-editing precision in plant biology", "Peer-reviewed discovery improves crop drought resilience without off-target edits.", "ScienceDaily", "AU"),
        ("Fusion energy reactor sustains record plasma confinement duration in Munich", "Nuclear physics researchers validate superconducting magnet stability.", "DW", "DE"),
    ],
    "World News": [
        ("Global climate coalition expands solar and wind power to cut emissions by 18 percent", "Clean energy grid upgrades and international sustainability accords accelerate.", "Carbon Brief", "DE"),
        ("Amazon conservation treaty reports sharp decline in annual deforestation", "Satellite biodiversity monitoring aids international forest protection efforts.", "Folha", "BR"),
        ("Coastal cities unveil modular flood defense barriers ahead of monsoon season", "International climate adaptation summit funds urban ecosystem restoration.", "Straits Times", "SG"),
        ("United Nations maritime delegates review ocean coral reef recovery report", "Global marine biologists document reef resilience across Pacific atolls.", "ABC News", "AU"),
        ("G20 transport ministers align on cross-border EV battery recycling standards", "International sustainability consortium sets circular supply chain targets.", "Reuters", "JP"),
    ],
}

FIELDNAMES = ["title", "description", "url", "source", "country", "published_at", "category", "tone"]


def generate_global_dataset(output_path: str) -> None:
    base_time = datetime(2026, 11, 13, 0, 0, 0)
    rows = []
    article_idx = 1

    # 48 hourly buckets across 2 days: baseline ~2-4 articles/hour
    for hour_offset in range(48):
        current_dt = base_time + timedelta(hours=hour_offset)

        # Inject two genuine statistical anomaly spikes!
        if hour_offset == 18:
            count_in_hour = 19  # Major Technology / AI Summit Surge (Z > 3.0)
            forced_cats = ["Technology"] * 13 + ["Business"] * 4 + ["Science"] * 2
        elif hour_offset == 37:
            count_in_hour = 14  # Major World News / Climate Pact Surge (Z > 2.2)
            forced_cats = ["World News"] * 10 + ["Politics"] * 4
        else:
            count_in_hour = random.randint(2, 4)
            forced_cats = [random.choice(list(TEMPLATES.keys())) for _ in range(count_in_hour)]

        for i, cat in enumerate(forced_cats):
            tpl_title, tpl_desc, source, country = random.choice(TEMPLATES[cat])
            minute_offset = (i * 3) % 55
            ts = (current_dt + timedelta(minutes=minute_offset)).strftime("%Y-%m-%dT%H:%M:%SZ")
            variant_tag = f" [Brief #{article_idx}]" if article_idx % 3 != 0 else f" - Update {article_idx}"
            title = f"{tpl_title}{variant_tag}"
            url = f"https://news.example.org/{cat.lower()}/{article_idx}"
            tone = round(random.uniform(-3.5, 4.5), 2)

            # Leave category blank on 70% of rows to prove Spark categorizer works!
            raw_cat = cat if article_idx % 10 < 3 else ""

            # Inject realistic missing values on a few rows (Spark should clean & impute!)
            if article_idx == 15:
                country = ""
            if article_idx == 28:
                source = ""
            if article_idx == 42:
                tpl_desc = ""

            rows.append({
                "title": title,
                "description": tpl_desc,
                "url": url,
                "source": source,
                "country": country,
                "published_at": ts,
                "category": raw_cat,
                "tone": tone,
            })
            article_idx += 1

    # Inject 6 exact/near duplicate rows & 3 invalid rows to test Spark Cleaning metrics
    for dup_src in [rows[2], rows[10], rows[25], rows[40], rows[55], rows[70]]:
        rows.append(dict(dup_src))

    rows.append({
        "title": "",
        "description": "Missing headline row",
        "url": "https://news.example.org/invalid/1",
        "source": "Unknown",
        "country": "US",
        "published_at": "2026-11-11T10:00:00Z",
        "category": "",
        "tone": 0.0,
    })
    rows.append({
        "title": "Corrupt timestamp article should be filtered cleanly",
        "description": "Bad date test",
        "url": "https://news.example.org/invalid/2",
        "source": "TestSource",
        "country": "GB",
        "published_at": "not-a-valid-date",
        "category": "",
        "tone": 0.0,
    })

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Generated {len(rows)} rows -> {output_path}")


def generate_tech_surge_dataset(output_path: str) -> None:
    base_time = datetime(2026, 11, 14, 0, 0, 0)
    rows = []
    idx = 1
    for hour_offset in range(24):
        current_dt = base_time + timedelta(hours=hour_offset)
        if hour_offset == 14:
            n = 22
            cats = ["Technology"] * 16 + ["Science"] * 4 + ["Business"] * 2
        else:
            n = random.randint(2, 4)
            cats = [random.choice(["Technology", "Business", "Science", "Health", "World News"]) for _ in range(n)]

        for i, cat in enumerate(cats):
            tpl_title, tpl_desc, source, country = random.choice(TEMPLATES[cat])
            ts = (current_dt + timedelta(minutes=(i * 2) % 58)).strftime("%Y-%m-%dT%H:%M:%SZ")
            rows.append({
                "title": f"{tpl_title} (Dispatch {idx})",
                "description": tpl_desc,
                "url": f"https://stream.example.org/item/{idx}",
                "source": source,
                "country": country,
                "published_at": ts,
                "category": "",
                "tone": round(random.uniform(-2.5, 5.0), 2),
            })
            idx += 1

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Generated {len(rows)} rows -> {output_path}")


if __name__ == "__main__":
    generate_global_dataset("data/raw/sample_global_news.csv")
    generate_tech_surge_dataset("data/raw/sample_tech_surge.csv")
