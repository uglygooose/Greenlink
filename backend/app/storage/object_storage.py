from __future__ import annotations

from dataclasses import dataclass

from app.config import get_settings


@dataclass(slots=True)
class ObjectStorageClient:
    endpoint: str
    bucket: str
    region: str
    access_key: str
    secret_key: str


def build_object_storage_client() -> ObjectStorageClient:
    settings = get_settings()
    return ObjectStorageClient(
        endpoint=settings.object_storage_endpoint,
        bucket=settings.object_storage_bucket,
        region=settings.object_storage_region,
        access_key=settings.object_storage_access_key,
        secret_key=settings.object_storage_secret_key,
    )
