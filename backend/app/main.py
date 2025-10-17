import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_process import router as process_router
from app.api.routes_scrape import router as scrape_router
from app.core.config import settings

app = FastAPI(title=settings.app_name, debug=settings.debug)

# Configure CORS for browser extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],  # In production, specify your extension's origin
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

# include routers
app.include_router(scrape_router)
app.include_router(process_router)


if __name__ == '__main__':
    import uvicorn

    port = int(os.environ.get('PORT', 8000))
    uvicorn.run('app.main:app', host='0.0.0.0', port=port, reload=settings.debug)
