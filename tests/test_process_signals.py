from __future__ import annotations

from backend.md_quiz.api.public import _merge_process_signals


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
