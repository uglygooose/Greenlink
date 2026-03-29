from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="GREENLINK_",
        case_sensitive=False,
    )

    env: Literal["development", "test", "staging", "production"] = "development"
    project_name: str = "GreenLink API"
    secret_key: str = "greenlink-dev-secret-key-change-me-2026"
    access_token_ttl_minutes: int = 15
    refresh_token_ttl_days: int = 14
    database_url: str = "sqlite+pysqlite:///./test.db"
    redis_url: str = "redis://localhost:6379/0"
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])
    log_level: str = "INFO"
    secure_cookies: bool = False
    object_storage_endpoint: str = "http://localhost:9000"
    object_storage_bucket: str = "greenlink-assets"
    object_storage_region: str = "us-east-1"
    object_storage_access_key: str = "change-me"
    object_storage_secret_key: str = "change-me"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
