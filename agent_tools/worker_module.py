# worker_module.py
import requests
from bs4 import BeautifulSoup
import csv
import os
import uuid
from urllib.parse import urljoin

RESULTS_CSV = "results.csv"

def scrape_url(url, selectors, depth=1, visited=None):
    if visited is None:
        visited = set()
    if url in visited or depth < 1:
        return []
    visited.add(url)

    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
    except Exception as e:
        print(f"Failed to fetch {url}: {e}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    item = {"url": url}
    for key, selector in selectors.items():
        item[key] = [el.get_text(strip=True) if el.name != 'a' else el.get('href') 
                     for el in soup.select(selector)]
    
    results = [item]

    # Follow links if depth > 1
    if depth > 1:
        for link in soup.select("a"):
            href = link.get("href")
            if href:
                next_url = urljoin(url, href)
                results.extend(scrape_url(next_url, selectors, depth-1, visited))

    return results

def append_to_csv(items):
    if not items:
        return
    os.makedirs(os.path.dirname(RESULTS_CSV) or ".", exist_ok=True)
    fieldnames = set()
    for item in items:
        fieldnames.update(item.keys())
    fieldnames = list(fieldnames)

    file_exists = os.path.exists(RESULTS_CSV)
    with open(RESULTS_CSV, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        if not file_exists:
            writer.writeheader()
        for item in items:
            writer.writerow(item)

def run_spider(job_id, url, selectors, depth=1):
    print(f"Running job {job_id} on {url}")
    results = scrape_url(url, selectors, depth)
    append_to_csv(results)
    print(f"Job {job_id} finished, {len(results)} items scraped")
    return job_id
