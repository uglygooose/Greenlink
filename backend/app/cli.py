from __future__ import annotations

import typer

from app.db import SessionLocal
from app.schemas.platform import (
    BootstrapInitialClubRequest,
    BootstrapRequest,
    BootstrapSuperadminRequest,
)
from app.services.platform_service import PlatformService

cli = typer.Typer(help="GreenLink backend maintenance commands")


@cli.command("bootstrap-platform")
def bootstrap_platform(
    superadmin_email: str,
    superadmin_password: str,
    superadmin_name: str,
    club_name: str | None = None,
    club_slug: str | None = None,
    club_timezone: str = "Africa/Johannesburg",
) -> None:
    initial_club = None
    if club_name and club_slug:
        initial_club = BootstrapInitialClubRequest(
            name=club_name,
            slug=club_slug,
            timezone=club_timezone,
        )
    payload = BootstrapRequest(
        superadmin=BootstrapSuperadminRequest(
            email=superadmin_email,
            password=superadmin_password,
            display_name=superadmin_name,
        ),
        initial_club=initial_club,
    )
    with SessionLocal() as db:
        response = PlatformService(db).bootstrap_platform(payload, correlation_id="cli-bootstrap")
    typer.echo(response.message)


if __name__ == "__main__":
    cli()
