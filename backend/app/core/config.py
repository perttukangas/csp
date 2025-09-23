# backend/app/core/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = 'My App'
    debug: bool = True


#    class Config:
#        env_file = ".env"

settings = Settings()
