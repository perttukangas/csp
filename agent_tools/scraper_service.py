# scraper_service.py
from fastapi import FastAPI
from pydantic import BaseModel
from rq import Queue
from redis import Redis
import uuid
from worker_module import run_spider

app = FastAPI()
redis_conn = Redis()
queue = Queue(connection=redis_conn)

class ScrapeRequest(BaseModel):
    url: str
    selectors: dict
    depth: int = 1

@app.post("/scrape")
def enqueue_scrape(req: ScrapeRequest):
    job_id = str(uuid.uuid4())
    queue.enqueue(run_spider, job_id, req.url, req.selectors, req.depth)
    return {"job_id": job_id, "status": "queued"}
