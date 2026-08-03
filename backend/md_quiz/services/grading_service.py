from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

from backend.md_quiz.config import logger
from backend.md_quiz.services import grading_analysis, grading_short_answer, grading_traits
from backend.md_quiz.services.llm_client import call_llm_json, call_llm_text


def _grade_completion(q: dict[str, Any], ans: Any) -> int:
    qtype = q["type"]
    points = int(q.get("points") or 0)
    options = q.get("options", [])
    if not options:
        return 0

    if qtype == "single":
        return points if str(ans or "").strip() else 0

    if qtype == "multiple":
        given = set(ans) if isinstance(ans, list) else set()
        if not given:
            return 0
        raw = points * len(given) / len(options)
        return max(0, min(points, round(raw)))

    return 0


def _grade_objective(q: dict[str, Any], ans: Any) -> int:
    qtype = q["type"]
    points = int(q.get("points") or 0)

    if qtype == "single":
        correct_key = next(
            (o["key"] for o in q.get("options", []) if o.get("correct")),
            None,
        )
        return points if (isinstance(ans, str) and ans == correct_key) else 0

    if qtype == "multiple":
        correct = {o["key"] for o in q.get("options", []) if o.get("correct")}
        given = set(ans) if isinstance(ans, list) else set()
        if not q.get("partial", False):
            return points if given == correct else 0
        if not correct:
            return 0
        correct_selected = len(given & correct)
        wrong_selected = len(given - correct)
        raw = (correct_selected - wrong_selected) / max(1, len(correct))
        score = round(points * raw)
        return max(0, min(points, int(score)))

    return 0


def grade_attempt(spec: dict[str, Any], assignment: dict[str, Any]) -> dict[str, Any]:
    answers = assignment.get("answers") or {}
    objective_details = []
    subjective_details = []
    subjective_details_by_qid: dict[str, dict[str, Any]] = {}
    trait_questions = []
    short_batch_candidates: list[dict[str, Any]] = []
    # Collect LLM grading tasks: (label, callable)
    llm_tasks: list[tuple[str, Any]] = []

    raw_total = 0
    raw_scored = 0
    exam_llm = spec.get("llm") or {}

    for q in spec.get("questions", []):
        qid = q["qid"]
        qtype = q["type"]

        if grading_traits._is_traits_question(q):
            trait_questions.append(q)
            continue

        max_points = int(q.get("max_points") or q.get("points") or 0)
        raw_total += max_points

        if qtype in {"single", "multiple"}:
            if str(q.get("scoring") or "").strip().lower() == "completion":
                scored = _grade_completion(q, answers.get(qid))
            else:
                scored = _grade_objective(q, answers.get(qid))
            raw_scored += scored
            objective_details.append({"qid": qid, "score": scored, "max": max_points})
            continue

        if qtype not in ("short", "code"):
            continue

        normalized_answer = grading_short_answer._normalize_short_answer(answers.get(qid, ""))
        if grading_short_answer._is_blank_short_answer(normalized_answer):
            subjective_details_by_qid[qid] = {
                "qid": qid,
                "score": 0,
                "max": max_points,
                "reason": "未作答、无意义内容或与题目无关，得 0 分",
            }
            continue

        if grading_short_answer._short_prompt_template(q, exam_llm):
            # Defer to parallel phase
            llm_tasks.append((qid, lambda q=q, a=normalized_answer, e=exam_llm: grading_short_answer._grade_short(
                q, a, e, llm_json=call_llm_json, llm_text=call_llm_text)))
            continue

        short_batch_candidates.append(
            {
                "qid": qid,
                "question": q,
                "answer": normalized_answer,
                "max_points": max_points,
            }
        )

    # ── Batch candidates via _grade_short_batches ──
    if len(short_batch_candidates) == 1:
        item = short_batch_candidates[0]
        llm_tasks.append((item["qid"], lambda item=item, e=exam_llm: grading_short_answer._grade_short(
            item["question"], item["answer"], e, llm_json=call_llm_json, llm_text=call_llm_text)))
    elif short_batch_candidates:
        # _grade_short_batches returns a list of results; wrap as a single task
        def _batch_task(candidates=short_batch_candidates):
            return grading_short_answer._grade_short_batches(
                candidates, llm_json=call_llm_json, llm_text=call_llm_text)
        llm_tasks.append(("__batch__", _batch_task))

    # ── Parallel LLM execution ──
    if llm_tasks:
        with ThreadPoolExecutor(max_workers=len(llm_tasks)) as executor:
            future_map: dict[Any, str] = {}
            for label, fn in llm_tasks:
                future_map[executor.submit(fn)] = label

            for future in as_completed(future_map):
                label = future_map[future]
                try:
                    result = future.result()
                except Exception as exc:
                    logger.warning("LLM grading task failed for %s: %s", label, exc)
                    if label == "__batch__":
                        for item in short_batch_candidates:
                            qid = str(item["qid"])
                            if qid not in subjective_details_by_qid:
                                subjective_details_by_qid[qid] = {
                                    "qid": qid, "score": 0,
                                    "max": int(item["max_points"] or 0),
                                    "reason": "LLM 调用失败",
                                }
                    else:
                        # Find the question to get max_points
                        spec_q = next((x for x in spec.get("questions", []) if x.get("qid") == label), {})
                        max_pts = int(spec_q.get("max_points") or spec_q.get("points") or 0)
                        subjective_details_by_qid[label] = {
                            "qid": label, "score": 0, "max": max_pts,
                            "reason": "LLM 调用失败",
                        }
                    continue

                if label == "__batch__":
                    for item in result:
                        qid = str(item.get("qid") or "")
                        subjective_details_by_qid[qid] = item
                        raw_scored += int(item.get("score") or 0)
                else:
                    scored, reason = result
                    spec_q = next((x for x in spec.get("questions", []) if x.get("qid") == label), {})
                    max_pts = int(spec_q.get("max_points") or spec_q.get("points") or 0)
                    subjective_details_by_qid[label] = {
                        "qid": label, "score": scored, "max": max_pts, "reason": reason,
                    }
                    raw_scored += scored

    for q in spec.get("questions", []):
        qid = str(q.get("qid") or "")
        if qid and qid in subjective_details_by_qid:
            subjective_details.append(subjective_details_by_qid[qid])

    scored_result = {
        "objective": objective_details,
        "subjective": subjective_details,
        "total": int(raw_scored),
        "total_max": int(raw_total),
    }
    trait_result = grading_traits._aggregate_traits(spec, assignment, trait_questions)

    scored_present = raw_total > 0
    traits_present = int(trait_result.get("question_count") or 0) > 0
    if scored_present and traits_present:
        result_mode = "mixed"
    elif scored_present:
        result_mode = "scored"
    else:
        result_mode = "traits"

    total = int(raw_scored if scored_present else 0)
    total_max = int(raw_total if scored_present else 0)
    overall_reason = f"score={total}/{total_max}" if scored_present else ""

    try:
        final_analysis = grading_analysis._generate_final_analysis(
            spec=spec,
            assignment=assignment,
            scored_result=scored_result,
            trait_result=trait_result,
            result_mode=result_mode,
            llm_text=call_llm_text,
        )
    except Exception as e:
        logger.warning("Grading final analysis failed: %s", e)
        final_analysis = grading_analysis._fallback_final_analysis(
            scored_result=scored_result,
            trait_result=trait_result,
            result_mode=result_mode,
        )

    return {
        "objective": objective_details,
        "subjective": subjective_details,
        "scored_result": scored_result,
        "trait_result": trait_result,
        "traits": trait_result,
        "result_mode": result_mode,
        "raw_total": raw_total,
        "raw_scored": raw_scored,
        "total": total,
        "total_max": total_max,
        "overall_reason": overall_reason,
        "final_analysis": final_analysis,
        "analysis": final_analysis,
        "graded_at": datetime.now(timezone.utc).isoformat(),
    }


generate_candidate_remark = grading_analysis.generate_candidate_remark


__all__ = [
    "call_llm_json",
    "call_llm_text",
    "generate_candidate_remark",
    "grade_attempt",
]
