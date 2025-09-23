from fastapi import FastAPI

from app.api.routes_items import router as items_router
from app.core.config import settings

app = FastAPI(title=settings.app_name, debug=settings.debug)

# include routers
app.include_router(items_router)


@app.get('/')
def root():
    return {'message': f'Welcome to {settings.app_name}!'}
