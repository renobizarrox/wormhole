"""Runner configuration via environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    redis_url: str = "redis://localhost:6379/0"
    control_plane_url: str = "http://localhost:3000"
    graphql_endpoint: str = "http://localhost:8080/v1/graphql"
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_database: str = "wormhole_logs"
    log_level: str = "INFO"


settings = Settings()
