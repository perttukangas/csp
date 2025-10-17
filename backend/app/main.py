from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_process import router as process_router
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
app.include_router(process_router)

@app.get('/')
def root():
    return {'message': f'Welcome to {settings.app_name}!'}
