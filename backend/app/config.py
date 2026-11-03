from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CareFlow Hospital API"
    database_url: str = "sqlite:///./hospital.db"
    secret_key: str = "local-development-only-change-before-deploy"
    access_token_minutes: int = 60
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_email: str = "admin@hospital.demo"
    admin_password: str = "ChangeMe123!"
    seed_demo_data: bool = True
    currency: str = "INR"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
