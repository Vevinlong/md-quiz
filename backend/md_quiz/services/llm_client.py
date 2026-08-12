"""
LLM client helpers used by grading, evaluation and resume parsing.

All vendors are accessed via the official OpenAI Python SDK.
Protocol adapters (Responses / Chat Completions) are selected by
the LLM_API_PROTOCOL environment variable via a registry pattern.
"""

from __future__ import annotations

import base64
import os
import time
from io import BytesIO
from typing import Any

import httpx
from openai import OpenAI

from backend.md_quiz.config import LLM_API_PROTOCOL, OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, logger
from backend.md_quiz.services.audit_context import get_audit_context, incr_audit_meta_int
from backend.md_quiz.services.system_metrics import incr_llm_tokens_and_alert, record_llm_usage


_OPENAI_CLIENT: OpenAI | None = None
_FILE_READY_STATUSES = {"processed", "ready", "completed", "succeeded", "success"}
_FILE_PENDING_STATUSES = {"uploaded", "processing", "pending", "queued", "in_progress"}
_FILE_FAILED_STATUSES = {"error", "failed", "expired", "cancelled", "canceled"}


# ═══════════════════════════════════════════════════════════════════
#  Protocol adapter registry
# ═══════════════════════════════════════════════════════════════════

_PROTOCOLS: dict[str, type["BaseLLMAdapter"]] = {}


def register_protocol(name: str):
    """Decorator: register an LLM protocol adapter class."""
    def dec(cls):
        _PROTOCOLS[name] = cls
        return cls
    return dec


class BaseLLMAdapter:
    """Protocol-agnostic base.  Subclasses implement _do_request and extract_output."""

    def __init__(self, client: OpenAI, model: str, timeout_seconds: int, response_format_json: bool):
        self.client = client
        self.model = model
        self.timeout_seconds = timeout_seconds
        self.response_format_json = response_format_json

    def request(
        self,
        *,
        input_messages: list[dict[str, Any]],
        temperature: float,
        top_p: float,
        instructions: str | None = None,
    ) -> Any:
        raise NotImplementedError

    @staticmethod
    def extract_output(obj: Any) -> str:
        raise NotImplementedError

    def file_request(
        self,
        *,
        file_bytes: bytes,
        filename: str,
        prompt: str,
        system: str,
    ) -> Any:
        """Override for protocols that handle file inputs differently."""
        raise NotImplementedError("File input not supported by this protocol adapter")


# ═══════════════════════════════════════════════════════════════════
#  Helper functions (unchanged)
# ═══════════════════════════════════════════════════════════════════

def _as_dict(obj: Any) -> dict[str, Any]:
    if isinstance(obj, dict):
        return obj
    if hasattr(obj, "model_dump"):
        try:
            dumped = obj.model_dump(mode="json")
            if isinstance(dumped, dict):
                return dumped
        except Exception:
            pass
    return {}


def _extract_llm_usage(obj: Any) -> tuple[int | None, int | None, int | None]:
    usage = None
    if isinstance(obj, dict):
        usage = obj.get("usage")
    else:
        usage = getattr(obj, "usage", None)
        if usage is None:
            usage = _as_dict(obj).get("usage")
    if usage is None:
        return None, None, None
    if not isinstance(usage, dict):
        usage = _as_dict(usage)
    if not isinstance(usage, dict):
        return None, None, None

    def _int(v: Any) -> int | None:
        if v is None or v == "":
            return None
        try:
            return int(v)
        except Exception:
            return None

    inp = _int(usage.get("input_tokens"))
    out = _int(usage.get("output_tokens"))
    tot = _int(usage.get("total_tokens"))
    if inp is None:
        inp = _int(usage.get("prompt_tokens"))
    if out is None:
        out = _int(usage.get("completion_tokens"))
    if tot is None:
        tot = _int(usage.get("total_tokens"))
    return inp, out, tot


def _response_model_name(obj: Any) -> str | None:
    model = getattr(obj, "model", None)
    if isinstance(model, str) and model.strip():
        return model.strip()
    data = _as_dict(obj)
    model = data.get("model")
    if isinstance(model, str) and model.strip():
        return model.strip()
    return None


def _accumulate_llm_usage(obj: Any) -> None:
    try:
        _ptk, _ctk, ttk = _extract_llm_usage(obj)
    except Exception:
        ttk = None
    incr_audit_meta_int("llm_total_tokens_sum", ttk)
    try:
        incr_llm_tokens_and_alert(ttk)
    except Exception:
        pass
    try:
        record_llm_usage(total_tokens=ttk, ctx=get_audit_context(), model=_response_model_name(obj))
    except Exception:
        pass


def _supports_response_format_json() -> bool:
    return os.getenv("LLM_RESPONSE_FORMAT_JSON", "").strip().lower() in {"1", "true", "yes"}


def _env_timeout(name: str, default: int) -> int:
    v = str(os.getenv(name, "") or "").strip()
    if not v:
        return int(default)
    try:
        n = int(float(v))
    except Exception:
        return int(default)
    return max(5, min(600, n))


def _env_file_ready_timeout() -> float:
    v = str(os.getenv("LLM_FILE_READY_TIMEOUT", "") or "").strip()
    if not v:
        return 30.0
    try:
        n = float(v)
    except Exception:
        return 30.0
    return max(1.0, min(300.0, n))


def _env_max_retries() -> int:
    try:
        max_retries = int(os.getenv("LLM_RETRY_MAX", "2") or "2")
    except Exception:
        max_retries = 2
    return max(0, min(6, max_retries))


def _request_timeout(timeout_seconds: int) -> httpx.Timeout:
    total = float(max(5, int(timeout_seconds or 60)))
    connect = min(20.0, total)
    return httpx.Timeout(total, connect=connect, read=total, write=total)


def _uploaded_file_status(obj: Any) -> str:
    status = getattr(obj, "status", None)
    if not isinstance(status, str) or not status.strip():
        status = _as_dict(obj).get("status")
    return str(status or "").strip().lower()


def _wait_for_uploaded_file_ready(
    client: Any, file_id: str, initial_obj: Any = None, *, force_check: bool = False,
) -> None:
    timeout_seconds = _env_file_ready_timeout()
    deadline = time.time() + timeout_seconds
    status = _uploaded_file_status(initial_obj)
    if not status and force_check:
        status = _uploaded_file_status(client.files.retrieve(file_id))
    if not status:
        return
    interval = 0.5
    while True:
        if status in _FILE_READY_STATUSES:
            return
        if status in _FILE_FAILED_STATUSES:
            raise RuntimeError(f"模型服务处理上传文件失败，当前状态：{status}")
        if status not in _FILE_PENDING_STATUSES:
            logger.debug("Unknown LLM uploaded file status: %s", status)
            return
        now = time.time()
        if now >= deadline:
            raise RuntimeError("模型服务仍在处理上传文件，等待超时，请稍后重试或调高 LLM_FILE_READY_TIMEOUT")
        time.sleep(min(interval, max(0.0, deadline - now)))
        current = client.files.retrieve(file_id)
        status = _uploaded_file_status(current)
        if not status:
            return
        interval = min(2.0, interval * 1.5)


def _exception_search_text(exc: Exception) -> str:
    parts = [str(exc)]
    for attr in ("code", "param", "type", "body"):
        val = getattr(exc, attr, None)
        if val:
            parts.append(str(val))
    return " ".join(parts)


def _is_file_processing_state_error(exc: Exception) -> bool:
    text = _exception_search_text(exc).lower()
    return (
        ("operationdenied.invalidstate" in text or "invalid state" in text)
        and "processing" in text
        and ("file" in text or "file_id" in text)
    )


def _get_openai_client() -> OpenAI:
    global _OPENAI_CLIENT
    if not OPENAI_API_KEY:
        raise RuntimeError("OPENAI_API_KEY is empty")
    if _OPENAI_CLIENT is None:
        _OPENAI_CLIENT = OpenAI(
            api_key=OPENAI_API_KEY,
            base_url=OPENAI_BASE_URL.rstrip("/"),
            max_retries=_env_max_retries(),
        )
    return _OPENAI_CLIENT


# ═══════════════════════════════════════════════════════════════════
#  Responses protocol adapter (default)
# ═══════════════════════════════════════════════════════════════════

@register_protocol("responses")
class ResponsesAdapter(BaseLLMAdapter):

    def request(self, *, input_messages, temperature, top_p, instructions=None):
        payload: dict[str, Any] = {
            "model": self.model,
            "input": input_messages,
            "temperature": temperature,
            "top_p": top_p,
        }
        if str(instructions or "").strip():
            payload["instructions"] = str(instructions or "").strip()
        if self.response_format_json:
            payload["text"] = {"format": {"type": "json_object"}}
        return self.client.responses.create(**payload)

    @staticmethod
    def extract_output(obj: Any) -> str:
        t = getattr(obj, "output_text", None)
        if isinstance(t, str) and t.strip():
            return t.strip()
        data = _as_dict(obj)
        if not data:
            return ""
        t = data.get("output_text")
        if isinstance(t, str) and t.strip():
            return t.strip()
        out = data.get("output")
        if isinstance(out, list):
            parts: list[str] = []
            for item in out:
                if not isinstance(item, dict):
                    continue
                content = item.get("content")
                if not isinstance(content, list):
                    continue
                for c in content:
                    if not isinstance(c, dict):
                        continue
                    if str(c.get("type") or "") in {"output_text", "text"} and isinstance(c.get("text"), str):
                        parts.append(str(c.get("text") or ""))
            txt = "".join(parts).strip()
            if txt:
                return txt
        try:
            choices = data.get("choices")
            if isinstance(choices, list) and choices:
                msg = (choices[0] or {}).get("message") or {}
                if isinstance(msg, dict):
                    return str(msg.get("content") or "").strip()
        except Exception:
            pass
        return ""

    def file_request(self, *, file_bytes, filename, prompt, system):
        """Responses API native file upload."""
        file_obj = BytesIO(bytes(file_bytes or b""))
        file_obj.name = str(filename or "resume.bin")
        uploaded = self.client.files.create(file=file_obj, purpose="user_data")
        uploaded_file_id = str(getattr(uploaded, "id", "") or "").strip()
        if not uploaded_file_id:
            raise RuntimeError("Files API returned empty file id")
        _wait_for_uploaded_file_ready(self.client, uploaded_file_id, uploaded)
        parts: list[dict[str, Any]] = [
            {"type": "input_file", "file_id": uploaded_file_id},
            {"type": "input_text", "text": str(prompt or "")},
        ]
        response_attempts = 3
        obj = None
        for attempt in range(response_attempts):
            try:
                obj = self.request(
                    input_messages=[{"role": "user", "content": parts}],
                    instructions=system,
                    temperature=0.0,
                    top_p=1.0,
                )
                break
            except Exception as e:
                if attempt >= response_attempts - 1 or not _is_file_processing_state_error(e):
                    raise
                logger.info("LLM uploaded file is still processing, retrying: %s", uploaded_file_id)
                _wait_for_uploaded_file_ready(self.client, uploaded_file_id, force_check=True)
                time.sleep(min(1.0, 0.3 * (attempt + 1)))
        if obj is None:
            raise RuntimeError("LLM response call returned empty result")
        return obj, uploaded_file_id


# ═══════════════════════════════════════════════════════════════════
#  Chat Completions protocol adapter
# ═══════════════════════════════════════════════════════════════════

@register_protocol("chat")
class ChatAdapter(BaseLLMAdapter):

    def _to_messages(self, input_messages: list[dict[str, Any]], instructions: str | None = None) -> list[dict[str, Any]]:
        """Convert Responses input format to Chat Completions messages format."""
        messages: list[dict[str, Any]] = []
        if instructions and str(instructions).strip():
            messages.append({"role": "system", "content": str(instructions).strip()})
        for msg in input_messages:
            role = msg.get("role", "user")
            content = msg.get("content")
            if isinstance(content, list):
                text_parts = []
                image_parts = []
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    ptype = str(part.get("type") or "")
                    if ptype in ("input_text", "text"):
                        text_parts.append(str(part.get("text") or ""))
                    elif ptype in ("input_image", "image_url"):
                        image_url = str(part.get("image_url") or "")
                        if image_url:
                            image_parts.append({"type": "image_url", "image_url": {"url": image_url}})
                if image_parts and not text_parts:
                    text_parts.append("")
                chat_content: Any
                if image_parts:
                    chat_content = [{"type": "text", "text": "\n".join(text_parts)}] + image_parts
                else:
                    chat_content = "\n".join(text_parts)
                messages.append({"role": role, "content": chat_content})
            elif isinstance(content, str):
                messages.append({"role": role, "content": content})
        return messages

    def request(self, *, input_messages, temperature, top_p, instructions=None):
        messages = self._to_messages(input_messages, instructions)
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "top_p": top_p,
        }
        if self.response_format_json:
            payload["response_format"] = {"type": "json_object"}
        return self.client.chat.completions.create(**payload)

    @staticmethod
    def extract_output(obj: Any) -> str:
        try:
            choices = getattr(obj, "choices", None)
            if choices and len(choices) > 0:
                msg = getattr(choices[0], "message", None)
                if msg:
                    content = getattr(msg, "content", "")
                    if isinstance(content, str):
                        return content.strip()
        except Exception:
            pass
        data = _as_dict(obj)
        try:
            choices = data.get("choices") or []
            if choices:
                msg = (choices[0] or {}).get("message") or {}
                return str(msg.get("content") or "").strip()
        except Exception:
            pass
        # Fallback to generic extractor for edge cases
        return ResponsesAdapter.extract_output(obj)

    def file_request(self, *, file_bytes, filename, prompt, system):
        """Chat Completions: extract text from file, send as message content."""
        import re

        text = ""
        fname = str(filename or "").lower()
        file_data = bytes(file_bytes or b"")

        if fname.endswith(".pdf") or ".pdf" in fname:
            try:
                from pypdf import PdfReader
                reader = PdfReader(BytesIO(file_data))
                pages = []
                for page in reader.pages:
                    t = page.extract_text()
                    if t:
                        pages.append(str(t))
                text = "\n".join(pages)
            except Exception as exc:
                logger.warning("pypdf extraction failed: %s", exc)
                text = ""
        elif fname.endswith((".docx", ".doc")) or ".docx" in fname or ".doc" in fname:
            try:
                from docx import Document
                doc = Document(BytesIO(file_data))
                paragraphs = [p.text for p in doc.paragraphs if p.text and p.text.strip()]
                text = "\n".join(paragraphs)
            except Exception as exc:
                logger.warning("python-docx extraction failed: %s", exc)
                text = ""
        else:
            try:
                text = file_data.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    text = file_data.decode("gbk")
                except Exception:
                    text = "[binary file, unable to extract text]"

        if not text or not text.strip():
            raise RuntimeError("Chat 模式下无法从此文件提取文本内容，请检查文件格式")

        combined = str(prompt or "").strip()
        if combined:
            combined += "\n\n--- 文件内容 ---\n" + text
        else:
            combined = text

        return self.request(
            input_messages=[{"role": "user", "content": [{"type": "input_text", "text": combined}]}],
            instructions=system,
            temperature=0.0,
            top_p=1.0,
        )


# ═══════════════════════════════════════════════════════════════════
#  Select adapter from environment
# ═══════════════════════════════════════════════════════════════════

_adapter_cls = _PROTOCOLS.get(LLM_API_PROTOCOL)
if _adapter_cls is None:
    raise RuntimeError(
        f"Unknown LLM_API_PROTOCOL: {LLM_API_PROTOCOL!r}. "
        f"Known protocols: {list(_PROTOCOLS)}"
    )


def _make_adapter(*, timeout_seconds: int, response_format_json: bool, model: str | None = None) -> BaseLLMAdapter:
    client = _get_openai_client().with_options(
        timeout=_request_timeout(timeout_seconds),
        max_retries=_env_max_retries(),
    )
    use_model = (model or "").strip() or OPENAI_MODEL
    return _adapter_cls(client, use_model, timeout_seconds, response_format_json)


# ═══════════════════════════════════════════════════════════════════
#  Public API (unchanged signatures)
# ═══════════════════════════════════════════════════════════════════

def _to_text_parts(prompt: str) -> list[dict[str, Any]]:
    return [{"type": "input_text", "text": str(prompt or "")}]


def call_llm_json(prompt: str, model: str | None = None) -> str:
    try:
        start = time.time()
        system = (
            "你是一名公正的阅卷老师，必须严格依据评分标准评分，但要允许部分得分。\n"
            "要求：\n"
            "1) score 必须是 0..max 的整数（可取中间分，不要只给 0 或满分）。\n"
            "2) 若答案只覆盖部分要点，请给对应比例的分数。\n"
            "3) 只输出一个 JSON 对象，不要输出多余文本。\n"
            "4) 字段：\n"
            "   - score: 0..max 的整数\n"
            "   - reason: 1-3 句简短理由\n"
            "   - relevance: 0..3（0=完全无关/无意义）\n"
            "   - contradiction: true/false（关键事实说反/矛盾时为 true，且应 score=0）\n"
            '示例：{"score":3,"reason":"...","relevance":2,"contradiction":false}\n'
        )
        adapter = _make_adapter(
            timeout_seconds=_env_timeout("LLM_TIMEOUT_JSON", 90),
            response_format_json=_supports_response_format_json(),
            model=model,
        )
        obj = adapter.request(
            input_messages=[{"role": "user", "content": _to_text_parts(str(prompt or ""))}],
            instructions=system,
            temperature=0.0,
            top_p=1.0,
        )
        dt = time.time() - start
        logger.debug("LLM(json) ok in %.2fs", dt)
        _accumulate_llm_usage(obj)
        return adapter.extract_output(obj)
    except Exception as e:
        logger.error("LLM call failed (json): %s", e)
        return ""


def call_llm_text(prompt: str, model: str | None = None) -> str:
    try:
        start = time.time()
        system = "你是一名资深面试官与能力评估专家。"
        adapter = _make_adapter(
            timeout_seconds=_env_timeout("LLM_TIMEOUT_TEXT", 90),
            response_format_json=False,
            model=model,
        )
        obj = adapter.request(
            input_messages=[{"role": "user", "content": _to_text_parts(str(prompt or ""))}],
            instructions=system,
            temperature=0.2,
            top_p=1.0,
        )
        dt = time.time() - start
        logger.debug("LLM(text) ok in %.2fs", dt)
        _accumulate_llm_usage(obj)
        return adapter.extract_output(obj)
    except Exception as e:
        logger.error("LLM call failed (text): %s", e)
        return ""


def call_llm_structured(prompt: str, *, system: str, model: str | None = None) -> str:
    txt, _err = call_llm_structured_ex(prompt, system=system, model=model)
    return txt


def call_llm_structured_ex(prompt: str, *, system: str, model: str | None = None) -> tuple[str, str]:
    try:
        start = time.time()
        adapter = _make_adapter(
            timeout_seconds=_env_timeout("LLM_TIMEOUT_STRUCTURED", 120),
            response_format_json=_supports_response_format_json(),
            model=model,
        )
        obj = adapter.request(
            input_messages=[{"role": "user", "content": _to_text_parts(str(prompt or ""))}],
            instructions=system,
            temperature=0.0,
            top_p=1.0,
        )
        dt = time.time() - start
        logger.debug("LLM(structured) ok in %.2fs", dt)
        _accumulate_llm_usage(obj)
        return adapter.extract_output(obj), ""
    except Exception as e:
        logger.error("LLM call failed (structured): %s", e)
        return "", f"{type(e).__name__}: {e}"


def call_llm_file_structured_ex(
    *, file_bytes: bytes, filename: str, prompt: str, system: str, model: str | None = None,
) -> tuple[str, str]:
    uploaded_file_id = ""
    try:
        start = time.time()
        adapter = _make_adapter(
            timeout_seconds=_env_timeout("LLM_TIMEOUT_STRUCTURED", 120),
            response_format_json=_supports_response_format_json(),
            model=model,
        )
        obj, uploaded_file_id = adapter.file_request(
            file_bytes=file_bytes,
            filename=filename,
            prompt=prompt,
            system=system,
        )
        dt = time.time() - start
        logger.debug("LLM(file-structured) ok in %.2fs", dt)
        _accumulate_llm_usage(obj)
        return adapter.extract_output(obj), ""
    except Exception as e:
        logger.error("LLM call failed (file-structured): %s", e)
        return "", f"{type(e).__name__}: {e}"
    finally:
        if uploaded_file_id:
            try:
                _get_openai_client().files.delete(uploaded_file_id)
            except Exception:
                logger.warning("Failed to cleanup uploaded LLM file: %s", uploaded_file_id)


def call_llm_vision_text(
    *, image_url: str, prompt: str, system: str | None = None, model: str | None = None,
) -> str:
    try:
        start = time.time()
        adapter = _make_adapter(
            timeout_seconds=_env_timeout("LLM_TIMEOUT_VISION", 120),
            response_format_json=False,
            model=model,
        )
        parts: list[dict[str, Any]] = [
            {"type": "input_image", "image_url": str(image_url or "")},
            {"type": "input_text", "text": str(prompt or "")},
        ]
        obj = adapter.request(
            input_messages=[{"role": "user", "content": parts}],
            instructions=(str(system or "").strip() or None),
            temperature=0.0,
            top_p=1.0,
        )
        dt = time.time() - start
        logger.debug("LLM(vision) ok in %.2fs", dt)
        _accumulate_llm_usage(obj)
        return adapter.extract_output(obj)
    except Exception as e:
        logger.error("LLM call failed (vision): %s", e)
        return ""


def call_llm_vision_structured_ex(
    *, image_url: str, prompt: str, system: str, model: str | None = None,
) -> tuple[str, str]:
    try:
        start = time.time()
        adapter = _make_adapter(
            timeout_seconds=_env_timeout("LLM_TIMEOUT_VISION", 120),
            response_format_json=_supports_response_format_json(),
            model=model,
        )
        parts: list[dict[str, Any]] = [
            {"type": "input_image", "image_url": str(image_url or "")},
            {"type": "input_text", "text": str(prompt or "")},
        ]
        obj = adapter.request(
            input_messages=[{"role": "user", "content": parts}],
            instructions=system,
            temperature=0.0,
            top_p=1.0,
        )
        dt = time.time() - start
        logger.debug("LLM(vision-structured) ok in %.2fs", dt)
        _accumulate_llm_usage(obj)
        return adapter.extract_output(obj), ""
    except Exception as e:
        logger.error("LLM call failed (vision-structured): %s", e)
        return "", f"{type(e).__name__}: {e}"
