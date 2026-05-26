from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

import yaml

from backend.md_quiz.services.exam_repo_sync_shared import (
    QUIZ_REPO_MANIFEST,
    ExamRepoSyncError,
    _FRONTMATTER_ID_RE,
    _JOB_DESCRIPTION_PATH_RE,
    _normalize_repo_relpath,
)
from backend.md_quiz.storage.db import (
    archive_missing_repo_job_descriptions,
    get_job_description_by_key,
    mark_job_description_sync_error,
    upsert_job_description_from_repo,
)

_FRONTMATTER_RE = re.compile(r"^---\n(?P<front>.*?)\n---[ \t]*\n?(?P<body>.*)$", re.DOTALL)
_VALID_JOB_DESCRIPTION_STATUSES = {"draft", "active", "archived"}


def _read_frontmatter_job_description_id(markdown_text: str) -> str:
    text = str(markdown_text or "")
    if not text.startswith("---"):
        return ""
    end = text.find("\n---", 3)
    if end < 0:
        return ""
    front = text[: end + 1]
    match = _FRONTMATTER_ID_RE.search(front)
    return str(match.group("id") if match else "").strip()


def _load_job_description_repo_manifest(repo_root: Path) -> list[str]:
    manifest_path = repo_root / QUIZ_REPO_MANIFEST
    if not manifest_path.exists() or not manifest_path.is_file():
        raise ExamRepoSyncError(f"仓库缺少 {QUIZ_REPO_MANIFEST}")
    readme_path = repo_root / "README.md"
    if not readme_path.exists() or not readme_path.is_file():
        raise ExamRepoSyncError("仓库缺少 README.md")
    try:
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8", errors="replace")) or {}
    except Exception as exc:
        raise ExamRepoSyncError(f"{QUIZ_REPO_MANIFEST} 解析失败：{exc}") from exc
    if not isinstance(raw, dict):
        raise ExamRepoSyncError(f"{QUIZ_REPO_MANIFEST} 必须是 YAML mapping")

    job_descriptions = raw.get("job_descriptions")
    if job_descriptions is None:
        return []
    if not isinstance(job_descriptions, list):
        raise ExamRepoSyncError(f"{QUIZ_REPO_MANIFEST} job_descriptions 必须是列表")

    paths: list[str] = []
    seen_paths: set[str] = set()
    repo_root_resolved = repo_root.resolve()
    for item in job_descriptions:
        if not isinstance(item, dict):
            raise ExamRepoSyncError(f"{QUIZ_REPO_MANIFEST} job_descriptions 条目必须是对象")
        source_path = _normalize_repo_relpath(str(item.get("path") or "").strip(), label="职位 manifest path")
        if not _JOB_DESCRIPTION_PATH_RE.fullmatch(source_path):
            raise ExamRepoSyncError(f"职位 manifest path 只支持 job-descriptions/<jd_key>/jd.md：{source_path}")
        if source_path in seen_paths:
            raise ExamRepoSyncError(f"{QUIZ_REPO_MANIFEST} 存在重复职位 path：{source_path}")
        abs_path = (repo_root / source_path).resolve()
        if repo_root_resolved not in abs_path.parents:
            raise ExamRepoSyncError(f"职位 manifest path 越界：{source_path}")
        if not abs_path.exists() or not abs_path.is_file():
            raise ExamRepoSyncError(f"职位 manifest path 不存在：{source_path}")
        seen_paths.add(source_path)
        paths.append(source_path)
    return paths


def _extract_job_description_document(markdown_text: str) -> tuple[dict[str, Any], str]:
    text = str(markdown_text or "").replace("\r\n", "\n")
    match = _FRONTMATTER_RE.match(text)
    if not match:
        raise ExamRepoSyncError("职位 Front Matter 缺失或格式不正确")
    try:
        raw = yaml.safe_load(match.group("front") or "") or {}
    except Exception as exc:
        raise ExamRepoSyncError(f"职位 Front Matter 解析失败：{exc}") from exc
    if not isinstance(raw, dict):
        raise ExamRepoSyncError("职位 Front Matter 必须是 YAML mapping")
    return raw, str(match.group("body") or "").lstrip("\n")


def _normalize_string_list(value: Any, *, label: str) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        raise ExamRepoSyncError(f"职位 {label} 必须是字符串列表")
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            raise ExamRepoSyncError(f"职位 {label} 必须是字符串列表")
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


def _snapshot_hash(markdown_text: str) -> str:
    normalized = str(markdown_text or "").replace("\r\n", "\n").encode("utf-8", errors="ignore")
    return hashlib.sha256(normalized).hexdigest()


def _build_job_description_candidate(repo_root: Path, repo_url: str, git_commit: str, source_path: str) -> dict[str, Any]:
    normalized_path = _normalize_repo_relpath(source_path, label="职位 path")
    match = _JOB_DESCRIPTION_PATH_RE.fullmatch(normalized_path)
    if not match:
        raise ExamRepoSyncError(f"职位 path 只支持 job-descriptions/<jd_key>/jd.md：{normalized_path}")
    path_key = str(match.group("jd_key") or "").strip()
    repo_root_resolved = repo_root.resolve()
    md_path = (repo_root / normalized_path).resolve()
    if repo_root_resolved not in md_path.parents:
        raise ExamRepoSyncError(f"职位 path 越界：{normalized_path}")
    markdown_text = md_path.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
    meta, content_md = _extract_job_description_document(markdown_text)

    jd_key = str(meta.get("id") or "").strip()
    if not jd_key:
        raise ExamRepoSyncError("职位 Front Matter 缺少 id")
    if jd_key != path_key:
        raise ExamRepoSyncError(f"职位 Front Matter id 必须与目录名一致：{path_key}")
    title = str(meta.get("title") or "").strip()
    if not title:
        raise ExamRepoSyncError("职位 Front Matter 缺少 title")
    status = str(meta.get("status") or "draft").strip().lower()
    if status not in _VALID_JOB_DESCRIPTION_STATUSES:
        raise ExamRepoSyncError("职位 status 必须是 draft、active 或 archived")

    return {
        "jd_key": jd_key,
        "title": title,
        "status": status,
        "tags": _normalize_string_list(meta.get("tags"), label="tags"),
        "related_quizzes": _normalize_string_list(meta.get("related_quizzes"), label="related_quizzes"),
        "source_path": normalized_path,
        "git_repo_url": str(repo_url or "").strip(),
        "git_commit": str(git_commit or "").strip(),
        "markdown_text": markdown_text,
        "content_md": content_md,
        "content_hash": _snapshot_hash(markdown_text),
    }


def _sync_job_description_candidate(candidate: dict[str, Any], *, synced_at) -> dict[str, Any]:
    jd_key = str(candidate.get("jd_key") or "").strip()
    existing = get_job_description_by_key(jd_key)
    content_hash = str(candidate.get("content_hash") or "").strip()
    if existing is None:
        action = "created"
    elif str(existing.get("content_hash") or "").strip() == content_hash:
        action = "unchanged"
    else:
        action = "updated"
    row = upsert_job_description_from_repo(
        jd_key=jd_key,
        title=str(candidate.get("title") or "").strip(),
        content_md=str(candidate.get("content_md") or ""),
        status=str(candidate.get("status") or "draft").strip().lower(),
        related_quizzes=candidate.get("related_quizzes") if isinstance(candidate.get("related_quizzes"), list) else [],
        source_path=str(candidate.get("source_path") or "").strip(),
        git_repo_url=str(candidate.get("git_repo_url") or "").strip(),
        last_synced_commit=str(candidate.get("git_commit") or "").strip(),
        content_hash=content_hash,
        last_sync_at=synced_at,
    )
    return {
        "id": int(row.get("id") or 0),
        "jd_key": jd_key,
        "action": action,
    }


__all__ = [
    "_build_job_description_candidate",
    "_load_job_description_repo_manifest",
    "_read_frontmatter_job_description_id",
    "_sync_job_description_candidate",
    "archive_missing_repo_job_descriptions",
    "mark_job_description_sync_error",
]
