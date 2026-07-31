from __future__ import annotations

import html as html_lib
import re
from html.parser import HTMLParser

import markdown as mdlib

_MARKDOWN_EXTENSIONS = [
    "markdown.extensions.fenced_code",
    "markdown.extensions.tables",
    "markdown.extensions.sane_lists",
    "markdown.extensions.def_list",
]

_ALLOWED_TAGS = {
    "a",
    "blockquote",
    "br",
    "code",
    "dd",
    "dl",
    "dt",
    "del",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
}
_VOID_TAGS = {"br", "hr"}
_ALLOWED_ATTRIBUTES = {"a": {"href", "title"}, "code": {"class"}, "pre": set()}
_SAFE_URL_PREFIXES = ("http://", "https://", "mailto:", "/", "#")
_DOCUMENT_MARKDOWN_FENCE_RE = re.compile(
    r"\A```[ \t]*(?:md|markdown)[^\n]*\n(?P<body>.*?)(?:\n)?```[ \t]*\Z",
    re.IGNORECASE | re.DOTALL,
)


def _is_safe_url(value: str) -> bool:
    text = str(value or "").strip()
    if not text:
        return False
    lower = text.lower()
    if lower.startswith("//"):
        return False
    if lower.startswith(_SAFE_URL_PREFIXES):
        return True
    return ":" not in text


class _MarkdownSanitizer(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=False)
        self.parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = str(tag or "").lower()
        if name not in _ALLOWED_TAGS:
            return
        allowed_attrs = _ALLOWED_ATTRIBUTES.get(name, set())
        rendered_attrs = []
        for raw_key, raw_value in attrs:
            key = str(raw_key or "").lower()
            if key not in allowed_attrs:
                continue
            value = str(raw_value or "").strip()
            if key == "href" and not _is_safe_url(value):
                continue
            rendered_attrs.append(f'{key}="{html_lib.escape(value, quote=True)}"')
        attr_text = f" {' '.join(rendered_attrs)}" if rendered_attrs else ""
        self.parts.append(f"<{name}{attr_text}>")

    def handle_endtag(self, tag: str) -> None:
        name = str(tag or "").lower()
        if name in _ALLOWED_TAGS and name not in _VOID_TAGS:
            self.parts.append(f"</{name}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        name = str(tag or "").lower()
        if name in _VOID_TAGS:
            self.handle_starttag(name, attrs)

    def handle_data(self, data: str) -> None:
        self.parts.append(html_lib.escape(data))

    def handle_entityref(self, name: str) -> None:
        self.parts.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self.parts.append(f"&#{name};")

    def html(self) -> str:
        return "".join(self.parts)


def sanitize_html(raw_html: str) -> str:
    parser = _MarkdownSanitizer()
    parser.feed(str(raw_html or ""))
    parser.close()
    return parser.html()


def _unwrap_document_markdown_fence(markdown_text: str) -> str:
    text = str(markdown_text or "").strip()
    match = _DOCUMENT_MARKDOWN_FENCE_RE.match(text)
    if not match:
        return text
    return str(match.group("body") or "").strip()


_CODE_BLOCK_RE = re.compile(
    r'<pre><code class="language-(\w+)">(.*?)</code></pre>',
    re.DOTALL,
)


def _convert_code_blocks(html_text: str) -> str:
    """Convert <pre><code> to <div class=\"code-stem\"> for client-side CodeMirror rendering."""
    def _replace(m: re.Match) -> str:
        lang = m.group(1)
        code = m.group(2)
        return f'<div class="code-stem" data-lang="{lang}">{code}</div>'
    return _CODE_BLOCK_RE.sub(_replace, html_text)


def render_markdown_html(markdown_text: str) -> str:
    text = _unwrap_document_markdown_fence(markdown_text)
    if not text:
        return ""
    rendered = mdlib.markdown(
        text,
        extensions=_MARKDOWN_EXTENSIONS,
        output_format="html5",
    )
    safe = sanitize_html(rendered)
    return _convert_code_blocks(safe)
