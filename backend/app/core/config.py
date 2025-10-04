# backend/app/core/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = 'AI Web Scraper'
    debug: bool = True
    gemini_api_key: str = ''

    class Config:
        env_file = '.env'
        env_file_encoding = 'utf-8'


settings = Settings()
