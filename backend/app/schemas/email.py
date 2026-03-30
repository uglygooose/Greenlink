from __future__ import annotations

import re
from typing import Annotated

from pydantic import AfterValidator, EmailStr, TypeAdapter

DEV_EMAIL_DOMAIN = "greenlink.test"
DEV_EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@" + re.escape(DEV_EMAIL_DOMAIN) + r"$"
)
STANDARD_EMAIL = TypeAdapter(EmailStr)


def validate_greenlink_email(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        raise ValueError("value is not a valid email address")
    if DEV_EMAIL_PATTERN.fullmatch(normalized):
        return normalized
    return str(STANDARD_EMAIL.validate_python(normalized))


GreenLinkEmail = Annotated[str, AfterValidator(validate_greenlink_email)]
