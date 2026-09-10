from __future__ import annotations

from pathlib import Path

from backend.md_quiz.api import admin as admin_api
from backend.md_quiz.api.public import _merge_process_signals, _merge_process_summary
from backend.md_quiz.services import runtime_jobs


ROOT = Path(__file__).resolve().parents[1]


def test_merge_process_signals_normalizes_and_filters_by_question_type():
    assignment: dict = {}
    questions = [
        {"qid": "Q1", "type": "short"},
        {"qid": "Q2", "type": "code"},
        {"qid": "Q3", "type": "single"},
    ]

    _merge_process_signals(
        assignment,
        questions,
        {
            "Q1": {
                "paste_count": "2",
                "chunk_inputs": [
                    {"at_sec": 3, "chars": 31},
                    {"at_sec": "4", "chars": 0},
                ],
                "edit_start_ts": 1720000000,
                "edit_duration_seconds": 108,
                "tab_switches": [{"at_sec": 5, "duration_sec": 60}],
            },
            "Q2": {"paste_count": 0, "chunk_inputs": [], "tab_switches": []},
            "Q3": {"paste_count": 1, "chunk_inputs": [{"at_sec": 1, "chars": 50}]},
        },
    )

    assert set(assignment["process_signals"]) == {"Q1"}
    assert assignment["process_signals"]["Q1"]["paste_count"] == 2
    assert assignment["process_signals"]["Q1"]["chunk_inputs"] == [{"at_sec": 3, "chars": 31}]
    assert assignment["process_signals"]["Q1"]["edit_duration_seconds"] == 108
    assert assignment["process_signals"]["Q1"]["tab_switches"] == [{"at_sec": 5, "duration_sec": 60}]


def test_merge_process_signals_removes_empty_signal():
    assignment = {"process_signals": {"Q1": {"paste_count": 2}}}

    _merge_process_signals(
        assignment,
        [{"qid": "Q1", "type": "short"}],
        {"Q1": {"paste_count": 0, "chunk_inputs": [], "tab_switches": []}},
    )

    assert assignment.get("process_signals") is None


def test_merge_process_signals_ignores_non_dict_payload():
    assignment = {"process_signals": {"Q1": {"paste_count": 1}}}

    _merge_process_signals(assignment, [{"qid": "Q1", "type": "short"}], None)

    assert assignment["process_signals"] == {"Q1": {"paste_count": 1}}


def test_merge_process_summary_recomputes_totals_from_question_signals():
    assignment = {
        "process_signals": {
            "Q1": {
                "paste_count": 2,
                "chunk_inputs": [{"at_sec": 3, "chars": 31}],
                "tab_switches": [{"at_sec": 5, "duration_sec": 60}],
            },
            "Q2": {
                "paste_count": 1,
                "chunk_inputs": [
                    {"at_sec": 8, "chars": 40},
                    {"at_sec": 12, "chars": 50},
                ],
                "tab_switches": [
                    {"at_sec": 2, "duration_sec": 10},
                    {"at_sec": 6, "duration_sec": 20},
                ],
            },
        }
    }

    _merge_process_summary(
        assignment,
        {
            "paste_count": 999,
            "chunk_input_count": 999,
            "tab_switch_count": 999,
            "unattributed_tab_switch_count": "3",
        },
    )

    assert assignment["process_summary"] == {
        "paste_count": 3,
        "chunk_input_count": 3,
        "tab_switch_count": 6,
        "unattributed_tab_switch_count": 3,
    }


def test_merge_process_summary_keeps_unattributed_switches_without_question_signal():
    assignment = {}

    _merge_process_summary(assignment, {"unattributed_tab_switch_count": 2})

    assert assignment["process_summary"] == {
        "paste_count": 0,
        "chunk_input_count": 0,
        "tab_switch_count": 2,
        "unattributed_tab_switch_count": 2,
    }


def test_process_signal_flag_ignores_edit_duration_only():
    assert admin_api._process_signal_flagged(
        {"paste_count": 0, "chunk_inputs": [], "edit_duration_seconds": 3600, "tab_switches": []}
    ) is False


def test_process_signal_flag_requires_counting_facts():
    assert admin_api._process_signal_flagged({"paste_count": 1, "chunk_inputs": [], "tab_switches": []}) is True
    assert admin_api._process_signal_flagged({"paste_count": 0, "chunk_inputs": [{"chars": 132}], "tab_switches": []}) is True
    assert admin_api._process_signal_flagged({"paste_count": 0, "chunk_inputs": [], "tab_switches": [{"at_sec": 3}]}) is True
    assert admin_api._process_signal_flagged(None) is False


def test_public_process_signal_timing_contract():
    source = (ROOT / "static" / "public" / "modules" / "process-signals.js").read_text(encoding="utf-8")
    input_start = source.index("trackProcessInput(qid, rawValue)")
    input_end = source.index("trackProcessPaste(qid)", input_start)
    input_block = source[input_start:input_end]
    visibility_start = source.index("trackProcessVisibility()")
    visibility_end = source.index("processSignalSnapshot(qid)", visibility_start)
    visibility_block = source[visibility_start:visibility_end]

    assert "if (!this._processStartedAtMs[qid] && (value || previous))" in input_block
    assert "this._ensureProcessSignal(qid);" in input_block
    assert "at_sec: this._processSecondsSinceEngagement(qid)" in visibility_block


def test_public_process_summary_hydration_contract():
    source = (ROOT / "static" / "public" / "modules" / "process-signals.js").read_text(encoding="utf-8")
    hydrate_start = source.index("hydrateProcessSignalsFromState()")
    hydrate_end = source.index("initProcessSignals()", hydrate_start)
    hydrate_block = source[hydrate_start:hydrate_end]

    assert hydrate_block.index("const summary =") < hydrate_block.index(
        'if (!stored || typeof stored !== "object")'
    )
    assert "this._processUnattributedTabSwitchCount" in hydrate_block


def test_process_suspect_any_question_triggers_paper_flag():
    signals = {
        "Q1": {"paste_count": 0, "chunk_inputs": [], "tab_switches": []},
        "Q2": {"paste_count": 1, "chunk_inputs": [], "tab_switches": []},
    }

    assert admin_api._process_suspect(signals) is True
    assert admin_api._process_suspect({}) is False


def test_process_suspect_covers_unattributed_switches_and_signal_fallback():
    assert admin_api._process_suspect({}, {"tab_switch_count": 1}) is True
    assert (
        admin_api._process_suspect(
            {"Q1": {"paste_count": 1, "chunk_inputs": [], "tab_switches": []}},
            {"paste_count": 0, "chunk_input_count": 0, "tab_switch_count": 0},
        )
        is True
    )


def test_build_process_summary_recomputes_archive_totals():
    archive = {
        "process_signals": {
            "Q1": {
                "paste_count": 2,
                "chunk_inputs": [{"at_sec": 3, "chars": 31}],
                "tab_switches": [{"at_sec": 5, "duration_sec": 60}],
            }
        },
        "process_summary": {
            "paste_count": 999,
            "chunk_input_count": 999,
            "tab_switch_count": 999,
            "unattributed_tab_switch_count": 2,
        },
    }

    summary = admin_api._build_process_summary(archive=archive, assignment=None)

    assert summary == {
        "flagged_question_count": 1,
        "paste_count": 2,
        "chunk_input_count": 1,
        "tab_switch_count": 3,
        "unattributed_tab_switch_count": 2,
    }


def test_archive_candidate_attempt_carries_process_signals(monkeypatch):
    captured: dict = {}

    monkeypatch.setattr(
        runtime_jobs,
        "get_candidate",
        lambda candidate_id: {"id": candidate_id, "name": "候选人", "phone": "13800000001"},
    )
    monkeypatch.setattr(
        runtime_jobs,
        "save_quiz_archive",
        lambda **kwargs: captured.update(kwargs),
    )
    monkeypatch.setattr(
        runtime_jobs,
        "get_exam_snapshot_for_assignment",
        lambda assignment: {
            "spec": {"questions": [{"qid": "Q1", "type": "short", "max_points": 10}]},
            "public_spec": {"questions": [{"qid": "Q1", "type": "short", "max_points": 10}]},
        },
    )

    signals = {"Q1": {"paste_count": 1, "chunk_inputs": [], "tab_switches": []}}
    process_summary = {
        "paste_count": 1,
        "chunk_input_count": 0,
        "tab_switch_count": 1,
        "unattributed_tab_switch_count": 0,
    }
    runtime_jobs._archive_candidate_attempt(
        {
            "token": "archive-token",
            "quiz_key": "demo-quiz",
            "quiz_version_id": 7,
            "candidate_id": 1,
            "answers": {"Q1": "答案"},
            "process_signals": signals,
            "process_summary": process_summary,
        },
        spec={"questions": [{"qid": "Q1", "type": "short", "max_points": 10}]},
    )

    assert captured["archive"]["process_signals"] == signals
    assert captured["archive"]["process_summary"] == process_summary


def test_build_review_answers_attaches_process_signal_and_flag():
    archive = {
        "process_signals": {
            "Q1": {"paste_count": 2, "chunk_inputs": [], "tab_switches": []}
        },
        "questions": [
            {
                "qid": "Q1",
                "type": "short",
                "stem_md": "题目",
                "answer": "答案",
                "score": 8,
            }
        ],
    }

    answers = admin_api._build_review_answers(archive=archive, assignment=None)

    assert answers[0]["qid"] == "Q1"
    assert answers[0]["process_signal"]["paste_count"] == 2
    assert answers[0]["process_flag"] is True
