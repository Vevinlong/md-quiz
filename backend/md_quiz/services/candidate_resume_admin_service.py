from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from backend.md_quiz.services import resume_ingest_service
from backend.md_quiz.services import support_deps as deps
from backend.md_quiz.services import validation_helpers
from backend.md_quiz.storage import JobStore


ADMIN_CANDIDATE_RESUME_UPLOAD_JOB_KIND = "admin_candidate_resume_upload"
ADMIN_CANDIDATE_RESUME_REPARSE_JOB_KIND = "admin_candidate_resume_reparse"
_STAGED_RESUME_DIR = Path(deps.BASE_DIR) / "tmp" / "resume_jobs"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _duration_seconds(started_at: datetime, finished_at: datetime) -> int:
    return max(0, int((finished_at - started_at).total_seconds()))


def _details_status_from_payload(payload: dict[str, Any]) -> str:
    parsed = payload.get("resume_parsed") or {}
    if not isinstance(parsed, dict):
        return ""
    details = parsed.get("details") or {}
    if not isinstance(details, dict):
        return ""
    return str(details.get("status") or "").strip()


def _job_result_from_candidate_result(result: dict[str, Any]) -> dict[str, Any]:
    candidate = result.get("candidate") if isinstance(result.get("candidate"), dict) else {}
    return {
        "created": bool(result.get("created")),
        "candidate_id": int(result.get("candidate_id") or 0),
        "candidate_name": str(candidate.get("name") or "").strip(),
        "resume_filename": str(candidate.get("resume_filename") or "").strip(),
    }


def _ensure_stage_dir() -> Path:
    _STAGED_RESUME_DIR.mkdir(parents=True, exist_ok=True)
    return _STAGED_RESUME_DIR


def _stage_resume_bytes(*, data: bytes, filename: str, mime: str) -> dict[str, Any]:
    suffix = Path(str(filename or "").strip()).suffix.lower() or ".bin"
    stage_dir = _ensure_stage_dir()
    stage_path = stage_dir / f"{uuid4().hex}{suffix}"
    stage_path.write_bytes(data)
    return {
        "staged_path": str(stage_path),
        "filename": str(filename or "").strip(),
        "mime": str(mime or "").strip(),
    }


def _read_staged_resume_bytes(staged_path: str) -> bytes:
    path = Path(str(staged_path or "").strip())
    if not path.is_file():
        raise HTTPException(status_code=400, detail="暂存简历不存在")
    return path.read_bytes()


def _cleanup_staged_resume(staged_path: str) -> None:
    path = Path(str(staged_path or "").strip())
    try:
        if path.is_file():
            path.unlink()
    except Exception:
        pass


def _candidate_default_job_description(candidate_id: int) -> dict[str, Any] | None:
    try:
        rows = deps.list_candidate_job_descriptions(int(candidate_id))
    except Exception:
        rows = []
    for row in rows:
        try:
            job_description_id = int((row or {}).get("id") or 0)
        except Exception:
            continue
        if job_description_id <= 0:
            continue
        job_description = deps.get_job_description(job_description_id)
        if job_description and str(job_description.get("status") or "").strip().lower() == "active":
            return job_description
    return None


def _process_candidate_resume_upload(
    data: bytes,
    *,
    filename: str,
    mime: str,
    job_description_id: int,
) -> dict[str, Any]:
    try:
        normalized_job_description_id = int(job_description_id)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="请选择职位") from exc
    job_description = deps.get_job_description(normalized_job_description_id) if normalized_job_description_id > 0 else None
    if not job_description or str(job_description.get("status") or "").strip().lower() != "active":
        raise HTTPException(status_code=400, detail="请选择有效职位")
    size_bytes = len(data)
    operation_started_at = _utc_now()
    resume_ingest_service.log_resume_parse_stage(
        "request.accepted",
        flow="candidate_upload",
        size_bytes=size_bytes,
        mime=mime,
    )
    payload = resume_ingest_service.parse_resume_payload(
        data=data,
        filename=filename,
        mime=mime,
        job_description=job_description,
        flow="candidate_upload",
        enable_stage_logs=True,
    )
    parsed_phone = validation_helpers._normalize_phone(str(payload.get("parsed_phone") or ""))
    if not validation_helpers._is_valid_phone(parsed_phone):
        resume_ingest_service.log_resume_parse_stage(
            "request.rejected",
            flow="candidate_upload",
            size_bytes=size_bytes,
            mime=mime,
            error="invalid_phone",
        )
        raise HTTPException(status_code=400, detail="未能从简历中识别有效手机号")

    parsed_name = str(payload.get("parsed_name") or "").strip()
    candidate_name = parsed_name if validation_helpers._is_valid_name(parsed_name) else "未知"
    existed = deps.get_candidate_by_phone(parsed_phone)
    created = False
    if existed:
        candidate_id = int(existed.get("id") or 0)
        old_name = str(existed.get("name") or "").strip()
        if old_name in {"", "未知"} and candidate_name != "未知":
            deps.update_candidate(candidate_id, name=candidate_name, phone=parsed_phone)
        deps.add_candidate_job_descriptions(candidate_id, [normalized_job_description_id])
    else:
        candidate_id = int(
            deps.create_candidate(
                name=candidate_name,
                phone=parsed_phone,
                job_description_id=normalized_job_description_id,
            )
        )
        created = True

    deps.update_candidate_resume(
        candidate_id,
        resume_bytes=data,
        resume_filename=filename,
        resume_mime=mime,
        resume_size=size_bytes,
        resume_parsed=payload["resume_parsed"],
    )
    operation_finished_at = _utc_now()
    try:
        deps.log_event(
            "candidate.resume.parse",
            actor="admin",
            candidate_id=candidate_id,
            llm_total_tokens=(int(payload.get("llm_total_tokens") or 0) or None),
            started_at=operation_started_at,
            finished_at=operation_finished_at,
            duration_seconds=_duration_seconds(operation_started_at, operation_finished_at),
        )
        if created:
            deps.log_event(
                "candidate.create",
                actor="admin",
                candidate_id=candidate_id,
                meta={"name": candidate_name, "phone": parsed_phone},
            )
    except Exception:
        pass

    candidate = deps.get_candidate(candidate_id) or {
        "id": candidate_id,
        "name": candidate_name,
        "phone": parsed_phone,
    }
    resume_ingest_service.log_resume_parse_stage(
        "request.completed",
        flow="candidate_upload",
        candidate_id=candidate_id,
        size_bytes=size_bytes,
        mime=mime,
        details_status=_details_status_from_payload(payload),
        llm_tokens=int(payload.get("llm_total_tokens") or 0),
    )
    return {"created": created, "candidate_id": candidate_id, "candidate": candidate}


def _process_candidate_resume_reparse(candidate_id: int, data: bytes, *, filename: str, mime: str) -> dict[str, Any]:
    candidate = deps.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="候选人不存在")

    size_bytes = len(data)
    current_phone = str(candidate.get("phone") or "").strip()
    operation_started_at = _utc_now()
    resume_ingest_service.log_resume_parse_stage(
        "request.accepted",
        flow="candidate_reparse",
        candidate_id=candidate_id,
        size_bytes=size_bytes,
        mime=mime,
    )
    payload = resume_ingest_service.parse_resume_payload(
        data=data,
        filename=filename,
        mime=mime,
        job_description=_candidate_default_job_description(candidate_id),
        current_phone=current_phone,
        flow="candidate_reparse",
        candidate_id=candidate_id,
        enable_stage_logs=True,
    )
    parsed_name = str(payload.get("parsed_name") or "").strip()
    if str(candidate.get("name") or "").strip() in {"", "未知"} and validation_helpers._is_valid_name(parsed_name):
        deps.update_candidate(candidate_id, name=parsed_name, phone=current_phone)

    deps.update_candidate_resume(
        candidate_id,
        resume_bytes=data,
        resume_filename=filename,
        resume_mime=mime,
        resume_size=size_bytes,
        resume_parsed=payload["resume_parsed"],
    )
    operation_finished_at = _utc_now()
    try:
        deps.log_event(
            "candidate.resume.parse",
            actor="admin",
            candidate_id=int(candidate_id),
            llm_total_tokens=(int(payload.get("llm_total_tokens") or 0) or None),
            started_at=operation_started_at,
            finished_at=operation_finished_at,
            duration_seconds=_duration_seconds(operation_started_at, operation_finished_at),
            meta={"reparse": True},
        )
    except Exception:
        pass
    resume_ingest_service.log_resume_parse_stage(
        "request.completed",
        flow="candidate_reparse",
        candidate_id=candidate_id,
        size_bytes=size_bytes,
        mime=mime,
        details_status=_details_status_from_payload(payload),
        llm_tokens=int(payload.get("llm_total_tokens") or 0),
    )
    return {"candidate_id": candidate_id, "candidate": deps.get_candidate(candidate_id) or candidate}


def upload_candidate_resume(file: UploadFile, *, job_description_id: int) -> dict[str, Any]:
    data = resume_ingest_service.read_resume_bytes(file, missing_file_detail="缺少简历文件")
    return _process_candidate_resume_upload(
        data,
        filename=str(file.filename or ""),
        mime=str(file.content_type or ""),
        job_description_id=int(job_description_id),
    )


def enqueue_candidate_resume_upload(file: UploadFile, *, job_description_id: int) -> dict[str, Any]:
    data = resume_ingest_service.read_resume_bytes(file, missing_file_detail="缺少简历文件")
    filename = str(file.filename or "")
    mime = str(file.content_type or "")
    staged = _stage_resume_bytes(data=data, filename=filename, mime=mime)
    job = JobStore().enqueue(
        ADMIN_CANDIDATE_RESUME_UPLOAD_JOB_KIND,
        payload={**staged, "job_description_id": int(job_description_id)},
        source="admin-resume-upload",
    )
    return {
        "job_id": job.id,
        "status": job.status,
        "file_name": filename,
    }


def process_candidate_resume_upload_job(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    staged_path = str(payload.get("staged_path") or "").strip()
    try:
        data = _read_staged_resume_bytes(staged_path)
        result = _process_candidate_resume_upload(
            data,
            filename=str(payload.get("filename") or ""),
            mime=str(payload.get("mime") or ""),
            job_description_id=int(payload.get("job_description_id") or 0),
        )
        return _job_result_from_candidate_result(result)
    finally:
        _cleanup_staged_resume(staged_path)


def reparse_candidate_resume(candidate_id: int, file: UploadFile) -> dict[str, Any]:
    data = resume_ingest_service.read_resume_bytes(file, missing_file_detail="缺少简历文件")
    return _process_candidate_resume_reparse(
        candidate_id,
        data,
        filename=str(file.filename or ""),
        mime=str(file.content_type or ""),
    )


def enqueue_candidate_resume_reparse(candidate_id: int, file: UploadFile) -> dict[str, Any]:
    candidate = deps.get_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="候选人不存在")
    data = resume_ingest_service.read_resume_bytes(file, missing_file_detail="缺少简历文件")
    filename = str(file.filename or "")
    mime = str(file.content_type or "")
    staged = _stage_resume_bytes(data=data, filename=filename, mime=mime)
    job = JobStore().enqueue(
        ADMIN_CANDIDATE_RESUME_REPARSE_JOB_KIND,
        payload={
            **staged,
            "candidate_id": int(candidate_id),
        },
        source="admin-resume-reparse",
    )
    return {
        "job_id": job.id,
        "status": job.status,
        "file_name": filename,
        "candidate_id": int(candidate_id),
    }


def process_candidate_resume_reparse_job(payload: dict[str, Any] | None) -> dict[str, Any]:
    payload = payload or {}
    staged_path = str(payload.get("staged_path") or "").strip()
    try:
        data = _read_staged_resume_bytes(staged_path)
        result = _process_candidate_resume_reparse(
            int(payload.get("candidate_id") or 0),
            data,
            filename=str(payload.get("filename") or ""),
            mime=str(payload.get("mime") or ""),
        )
        return _job_result_from_candidate_result(result)
    finally:
        _cleanup_staged_resume(staged_path)
