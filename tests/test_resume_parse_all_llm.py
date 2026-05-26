def test_parse_resume_all_llm_uses_file_input_for_docx(monkeypatch):
    import backend.md_quiz.services.resume_service as resume_service

    calls = {}

    def fake_file_call(*, file_bytes: bytes, filename: str, prompt: str, system: str, model: str | None = None):
        calls["file_bytes"] = file_bytes
        calls["filename"] = filename
        calls["prompt"] = prompt
        calls["system"] = system
        calls["model"] = model
        return (
            """
            {
              "name": "张三",
              "phone": "13800138000",
              "confidence": {"name": 97, "phone": 98},
              "summary": "后端开发工程师，熟悉 Python 与数据平台。",
              "skills": ["Python", "FastAPI"],
              "projects": [{"name": "画像平台", "role": "负责人", "period": "2024", "description": ["负责服务拆分"]}],
              "experience_blocks": [{"kind": "project", "title": "画像平台", "period": "2024", "body": "负责服务拆分"}]
            }
            """,
            "",
        )

    monkeypatch.setattr(resume_service, "call_llm_file_structured_ex", fake_file_call)

    parsed = resume_service.parse_resume_all_llm(
        data=b"docx-bytes",
        filename="resume.docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )

    assert parsed["name"] == "张三"
    assert parsed["phone"] == "13800138000"
    assert parsed["details_status"] == "done"
    assert parsed["details"]["skills"] == ["Python", "FastAPI"]
    assert parsed["details"]["projects"][0]["name"] == "画像平台"
    assert calls["filename"] == "resume.docx"
    assert calls["file_bytes"] == b"docx-bytes"


def test_parse_resume_all_llm_includes_job_description_prompt(monkeypatch):
    import backend.md_quiz.services.resume_service as resume_service

    calls = {}

    def fake_file_call(*, file_bytes: bytes, filename: str, prompt: str, system: str, model: str | None = None):
        calls["prompt"] = prompt
        return (
            """
            {
              "name": "王五",
              "phone": "13700137000",
              "confidence": {"name": 95, "phone": 96},
              "evaluation": "候选人具备 Python 后端开发和服务治理经验，项目描述较完整，能覆盖岗位对接口开发、问题排查和工程协作的核心要求；简历中的量化结果不多，后续面试可重点核验性能优化、系统设计深度和线上稳定性经验。",
              "job_match_score": 82,
              "skills": ["Python", "FastAPI"],
              "experience_blocks": []
            }
            """,
            "",
        )

    monkeypatch.setattr(resume_service, "call_llm_file_structured_ex", fake_file_call)

    parsed = resume_service.parse_resume_all_llm(
        data=b"pdf-bytes",
        filename="resume.pdf",
        mime="application/pdf",
        job_description={"title": "Python 后端工程师", "content_md": "负责 Python 服务开发、接口治理和线上问题排查。"},
    )

    assert "【职位】" in calls["prompt"]
    assert "标题：Python 后端工程师" in calls["prompt"]
    assert "负责 Python 服务开发、接口治理和线上问题排查。" in calls["prompt"]
    assert parsed["details"]["evaluation"].startswith("候选人具备 Python 后端开发")
    assert parsed["details"]["job_match_score"] == 82


def test_parse_resume_all_llm_uses_vision_for_images(monkeypatch):
    from PIL import Image
    from io import BytesIO

    import backend.md_quiz.services.resume_service as resume_service

    calls = {}

    def fake_vision_call(*, image_url: str, prompt: str, system: str, model: str | None = None):
        calls["image_url"] = image_url
        calls["prompt"] = prompt
        calls["system"] = system
        calls["model"] = model
        return (
            """
            {
              "name": "李四",
              "phone": "13900139000",
              "confidence": {"name": 93, "phone": 95},
              "summary": "测试工程师。",
              "skills": ["测试"],
              "experience_blocks": []
            }
            """,
            "",
        )

    monkeypatch.setattr(resume_service, "call_llm_vision_structured_ex", fake_vision_call)

    img = Image.new("RGB", (32, 16), color="white")
    buf = BytesIO()
    img.save(buf, format="PNG")

    parsed = resume_service.parse_resume_all_llm(
        data=buf.getvalue(),
        filename="resume.png",
        mime="image/png",
    )

    assert parsed["name"] == "李四"
    assert parsed["phone"] == "13900139000"
    assert parsed["details"]["skills"] == ["测试"]
    assert parsed["details_status"] == "done"
    assert calls["image_url"].startswith("data:image/png;base64,")
