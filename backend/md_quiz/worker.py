from __future__ import annotations

import threading
import time

from backend.md_quiz.app import _build_container
from backend.md_quiz.services import runtime_bootstrap, runtime_jobs


def main() -> None:
    runtime_bootstrap.bootstrap_runtime()
    container = _build_container()
    settings = container.settings
    runtime = container.runtime_service
    jobs = container.job_service

    # Start auto-collect daemon: finalize timed-out assignments even when
    # the candidate closes the page.
    auto_thread = threading.Thread(
        target=runtime_jobs._auto_collect_loop,
        kwargs={"interval_seconds": 15},
        daemon=True,
        name="auto-collect",
    )
    auto_thread.start()

    runtime.heartbeat("worker", name="worker", status="starting", message="worker booting")
    while True:
        runtime.heartbeat("worker", name="worker", status="running", message="polling jobs")
        job = jobs.claim_next("worker")
        if job is None:
            time.sleep(settings.worker_poll_seconds)
            continue
        jobs.process(job)


if __name__ == "__main__":
    main()
