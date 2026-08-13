from __future__ import annotations

import os
from urllib.parse import urlsplit, urlunsplit

from fastapi import Request

_FORWARDED_SCHEMES = {"http", "https"}


def _first_forwarded_value(raw: str) -> str:
    return str(raw or "").split(",", 1)[0].strip()


def _forwarded_param(raw: str, key: str) -> str:
    segment = _first_forwarded_value(raw)
    if not segment:
        return ""
    for item in segment.split(";"):
        name, sep, value = item.partition("=")
        if not sep or name.strip().lower() != key:
            continue
        return value.strip().strip('"')
    return ""


def _configured_site_base_url() -> str:
    """Return the site base URL from SITE_BASE_URL env, if configured.

    Only scheme + host (and optional port) are kept; any path/query/fragment
    is dropped to keep generated links correct.
    """
    raw = os.getenv("SITE_BASE_URL", "").strip()
    if not raw:
        return ""
    if "://" not in raw:
        raw = f"https://{raw}"
    try:
        parsed = urlsplit(raw)
    except Exception:
        return ""
    netloc = parsed.netloc
    if not netloc:
        return ""
    scheme = parsed.scheme or "https"
    return urlunsplit((scheme, netloc, "", "", "")).rstrip("/")


def external_base_url(request: Request) -> str:
    # 1. Explicitly configured public domain (highest priority).
    configured = _configured_site_base_url()
    if configured:
        return configured

    base_url = request.base_url
    forwarded_header = request.headers.get("forwarded", "")
    scheme = _forwarded_param(forwarded_header, "proto").lower()
    if scheme not in _FORWARDED_SCHEMES:
        scheme = _first_forwarded_value(request.headers.get("x-forwarded-proto", "")).lower()
    if scheme not in _FORWARDED_SCHEMES:
        scheme = base_url.scheme

    host = _forwarded_param(forwarded_header, "host")
    if not host:
        host = _first_forwarded_value(request.headers.get("x-forwarded-host", ""))
    if not host:
        host = base_url.netloc

    return str(base_url.replace(scheme=scheme, netloc=host)).rstrip("/")
