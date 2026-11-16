"""
Multi-Source News Collector (GDELT 2.0 DOC API + Public RSS Feeds)
------------------------------------------------------------------
Primary source: GDELT Project v2 DOC API (https://api.gdeltproject.org/api/v2/doc/doc).
Automatic fallback when GDELT rate-limits (HTTP 429): Live multi-category RSS feeds
from BBC News and NPR so live news collection always yields real, current articles.

Usage:
    python3 collector/gdelt_collector.py --query "technology OR climate" --max-records 120 --output data/raw/gdelt_live.csv
"""

import argparse
import csv
import email.utils
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone


GDELT_DOC_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc"

LIVE_RSS_FEEDS = [
    ("https://feeds.bbci.co.uk/news/world/rss.xml", "BBC World", "GB", ""),
    ("https://feeds.bbci.co.uk/news/technology/rss.xml", "BBC Technology", "GB", "Technology"),
    ("https://feeds.bbci.co.uk/news/business/rss.xml", "BBC Business", "GB", "Business"),
    ("https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", "BBC Science", "GB", "Science"),
    ("https://feeds.bbci.co.uk/news/health/rss.xml", "BBC Health", "GB", "Health"),
    ("https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", "BBC Entertainment", "GB", "Entertainment"),
    ("https://feeds.bbci.co.uk/sport/rss.xml", "BBC Sport", "GB", "Sports"),
    ("https://feeds.npr.org/1001/rss.xml", "NPR News", "US", ""),
]


def parse_gdelt_seendate(seendate: str) -> str:
    """Convert GDELT seendate (e.g. 20261113T083000Z) to ISO-8601 UTC string."""
    if not seendate:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    cleaned = seendate.strip()
    for fmt in ("%Y%m%dT%H%M%SZ", "%Y%m%d%H%M%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            dt = datetime.strptime(cleaned, fmt)
            return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except ValueError:
            continue
    return cleaned


def parse_rss_pubdate(pubdate: str) -> str:
    if not pubdate:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    try:
        dt = email.utils.parsedate_to_datetime(pubdate.strip())
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_gdelt_articles(query: str, max_records: int = 150, timespan: str = "48h") -> list[dict]:
    """Query GDELT 2.0 DOC API with brief retry on 429/503."""
    params = {
        "query": f"{query} sourcelang:eng",
        "mode": "ArtList",
        "maxrecords": str(min(max(max_records, 10), 250)),
        "timespan": timespan,
        "format": "json",
        "sort": "DateDesc",
    }
    url = f"{GDELT_DOC_ENDPOINT}?{urllib.parse.urlencode(params)}"

    last_err = None
    for attempt in range(2):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "NewsPulse-BigData-Project/1.0",
                "Accept": "application/json",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                raw_body = resp.read().decode("utf-8", errors="replace")
                payload = json.loads(raw_body)
            articles = payload.get("articles", [])
            normalized = []
            for item in articles:
                title = (item.get("title") or "").strip()
                if not title:
                    continue
                domain = (item.get("domain") or "Unknown Source").strip()
                country = (item.get("sourcecountry") or "Global").strip()
                seen_iso = parse_gdelt_seendate(item.get("seendate", ""))
                article_url = (item.get("url") or "").strip()
                try:
                    tone_val = round(float(item.get("tone", 0.0)), 2)
                except (TypeError, ValueError):
                    tone_val = 0.0
                normalized.append(
                    {
                        "title": title,
                        "description": f"Published by {domain} ({country}) via GDELT Live Stream.",
                        "url": article_url,
                        "source": domain,
                        "country": country if country else "Global",
                        "published_at": seen_iso,
                        "category": "",
                        "tone": tone_val,
                    }
                )
            return normalized
        except urllib.error.HTTPError as exc:
            last_err = exc
            if exc.code in (429, 503) and attempt == 0:
                time.sleep(2)
                continue
            raise
    if last_err:
        raise last_err
    return []


def fetch_live_rss_articles(max_records: int = 150) -> list[dict]:
    """Fetch live multi-source articles from BBC and NPR public RSS feeds."""
    collected: list[dict] = []
    for feed_url, source_name, country, hint_cat in LIVE_RSS_FEEDS:
        if len(collected) >= max_records:
            break
        try:
            req = urllib.request.Request(
                feed_url,
                headers={"User-Agent": "NewsPulse-BigData-Project/1.0"},
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                xml_bytes = resp.read()
            root = ET.fromstring(xml_bytes)
            for item in root.findall(".//item"):
                if len(collected) >= max_records:
                    break
                title = (item.findtext("title") or "").strip()
                desc = (item.findtext("description") or "").strip()
                link = (item.findtext("link") or "").strip()
                pub = (item.findtext("pubDate") or "").strip()
                if not title:
                    continue
                collected.append(
                    {
                        "title": title,
                        "description": desc,
                        "url": link,
                        "source": source_name,
                        "country": country,
                        "published_at": parse_rss_pubdate(pub),
                        "category": hint_cat,
                        "tone": 0.0,
                    }
                )
        except Exception:
            continue
    return collected


def save_to_csv(rows: list[dict], output_path: str) -> None:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    fieldnames = [
        "title",
        "description",
        "url",
        "source",
        "country",
        "published_at",
        "category",
        "tone",
    ]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description="Collect live news articles from GDELT 2.0 DOC API & RSS")
    parser.add_argument("--query", default="(technology OR politics OR climate OR economy OR health OR science OR sports)", help="GDELT search query")
    parser.add_argument("--max-records", type=int, default=150, help="Maximum number of articles to fetch (10-250)")
    parser.add_argument("--timespan", default="48h", help="GDELT timespan window (e.g. 24h, 48h, 7d)")
    parser.add_argument("--output", default="data/raw/gdelt_live.csv", help="Destination CSV path")
    args = parser.parse_args()

    source_used = "GDELT 2.0 DOC API"
    rows: list[dict] = []

    try:
        rows = fetch_gdelt_articles(args.query, args.max_records, args.timespan)
    except Exception as gdelt_err:
        # Fall back to live multi-source BBC/NPR RSS feeds if GDELT rate-limits (429)
        rows = fetch_live_rss_articles(args.max_records)
        if rows:
            source_used = f"Live BBC/NPR RSS Fallback (GDELT unavailable: {gdelt_err})"
        else:
            print(json.dumps({"status": "error", "message": f"GDELT and RSS collection failed: {gdelt_err}"}), file=sys.stderr)
            return 1

    if not rows:
        rows = fetch_live_rss_articles(args.max_records)
        source_used = "Live BBC/NPR RSS Feeds"

    if not rows:
        print(json.dumps({"status": "empty", "message": "Live news endpoints returned 0 matching articles."}), file=sys.stderr)
        return 2

    save_to_csv(rows, args.output)
    print(json.dumps({"status": "ok", "source": source_used, "count": len(rows), "output": args.output}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
