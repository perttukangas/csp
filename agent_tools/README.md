

# Agent-Based Web Scraper Tool (Requests + BeautifulSoup)

* **FastAPI** – API layer for agents to submit scraping jobs
* **RQ + Redis** – lightweight job queue system
* **Requests + BeautifulSoup** – HTML scraping and traversal (instead of Scrapy)
* **CSV output** – results are appended to a shared `results.csv` file

The agent can submit jobs specifying:

* A **start URL**
* A set of **CSS selectors** to scrape
* A **depth** value (how far to follow links within the same domain)

---

## Directory Structure

```
.
├── scraper_service.py            # FastAPI app for submitting scrape jobs
├── worker.py         # Worker process that executes scraping jobs
├── results.csv       # Output data (created automatically)
├── requirements.txt  # Dependencies
└── README.md         # This file
```

---

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/getting-started/installation/) installed

## Installation

Install dependencies:

```bash
uv sync
```

You also need **Redis** installed and running:

```bash
sudo apt-get install redis-server   # Debian/Ubuntu
brew install redis                  # macOS
```

Start Redis:

```bash
redis-server
```

---

## How It Works

1. **Start Redis**

   ```bash
   redis-server
   ```

2. **Start the worker** (listens for jobs in the queue):

   ```bash
   uv run python worker.py
   ```

3. **Start the API server** (for submitting jobs):

   ```bash
   uv run uvicorn scraper_service:app --reload --port 8000
   ```

4. **Submit a scrape job** with `curl` or an agent:

   ```bash
   curl -X POST http://127.0.0.1:8000/scrape \
     -H "Content-Type: application/json" \
     -d '{
           "url": "https://example.com",
           "selectors": {"title": "h1", "links": "a"},
           "depth": 2
         }'
   ```

   Example response:

   ```json
   {
     "job_id": "c28c6ff1-17c1-41b0-9b3a-7b4e420e5d0b",
     "status": "queued"
   }
   ```

5. **Results** will be appended to `results.csv` with columns:
   * `url` – URL of the page scraped
   * One column for each selector (`title`, `links`, etc.)

---

## Example Output (`results.csv`)

```csv
job_id,url,title,links
c28c6ff1-17c1-41b0-9b3a-7b4e420e5d0b,https://example.com,"Example Domain","['https://www.iana.org/domains/example']"
c28c6ff1-17c1-41b0-9b3a-7b4e420e5d0b,https://www.iana.org/domains/example,"IANA — IANA-managed Reserved Domains","['/domains', '/about']"
```

---

## Features

* Queue-based job management (no blocking API requests)
* Arbitrary CSS selectors per job
* Depth-limited traversal (BFS, same-domain only)
* Results appended to a shared CSV

---

## Notes

* `depth=0` → scrape only the start URL.
* Traversal is limited to the **same domain** as the start URL.
* `max_pages=20` limit is enforced in `worker.py` to prevent runaway crawling.
* For parallel scraping, you can run multiple workers:

  ```bash
  uv run python worker.py &
  uv run python worker.py &
  ```