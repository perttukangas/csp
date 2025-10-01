import csv
import uuid
import requests
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from rq import Worker, Queue, Connection
from redis import Redis

RESULTS_CSV = "results.csv"


def run_spider(job_id, start_url, selectors, depth=1, max_pages=20):
    """
    Simple crawler with traversal using requests + BeautifulSoup.
    - job_id: UUID of job
    - start_url: URL to scrape
    - selectors: dict of {field: css_selector}
    - depth: how many link levels to follow
    - max_pages: safety limit on number of pages
    """

    visited = set()
    to_visit = [(start_url, 0)]  # (url, current_depth)
    results = []

    while to_visit and len(visited) < max_pages:
        url, current_depth = to_visit.pop(0)
        if url in visited or current_depth > depth:
            continue

        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
        except Exception as e:
            print(f"[JOB {job_id}] Failed to fetch {url}: {e}")
            continue

        visited.add(url)
        soup = BeautifulSoup(response.text, "html.parser")

        # Extract data based on selectors
        result = {"job_id": job_id, "url": url}
        for name, css_selector in selectors.items():
            elements = soup.select(css_selector)
            result[name] = [
                el.get_text(strip=True) if el.text else el.get("href") for el in elements
            ]
        results.append(result)

        # Collect links for traversal
        if current_depth < depth:
            for link in soup.select("a[href]"):
                href = link.get("href")
                if href:
                    abs_url = urljoin(url, href)
                    # Stay within same domain as start_url
                    if urlparse(abs_url).netloc == urlparse(start_url).netloc:
                        to_visit.append((abs_url, current_depth + 1))

    # Save results to CSV
    with open(RESULTS_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=results[0].keys())
        if f.tell() == 0:
            writer.writeheader()
        writer.writerows(results)

    return results


# --- Worker Setup ---
listen = ["default"]
redis_conn = Redis()

if __name__ == "__main__":
    with Connection(redis_conn):
        worker = Worker(map(Queue, listen))
        worker.work()
