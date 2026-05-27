from __future__ import annotations

import threading

import psycopg2.pool
import pytest
from fastapi.testclient import TestClient

from backend.md_quiz.app import create_app
from backend.md_quiz.storage import db


class FakeConnection:
    autocommit = True

    def __init__(self) -> None:
        self.committed = False
        self.rolled_back = False
        self.closed = False

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        self.rolled_back = True

    def close(self) -> None:
        self.closed = True


class FakePool:
    def __init__(self) -> None:
        self.connections: list[FakeConnection] = []
        self.put_count = 0

    def getconn(self) -> FakeConnection:
        conn = FakeConnection()
        self.connections.append(conn)
        return conn

    def putconn(self, _conn: FakeConnection) -> None:
        self.put_count += 1


def test_conn_scope_waits_for_pool_gate_and_times_out(monkeypatch):
    fake_pool = FakePool()
    gate = threading.BoundedSemaphore(1)
    assert gate.acquire(blocking=False)
    monkeypatch.setattr(db, "_PG_POOL", fake_pool)
    monkeypatch.setattr(db, "_PG_POOL_GATE", gate)
    monkeypatch.setattr(db, "_PG_POOL_MAXCONN", 1)
    monkeypatch.setattr(db, "_PG_POOL_WAIT_TIMEOUT_SECONDS", 0.01)

    with pytest.raises(psycopg2.pool.PoolError, match="connection pool exhausted after waiting"):
        with db.conn_scope():
            pass

    assert fake_pool.connections == []
    gate.release()


def test_conn_scope_releases_pool_gate_after_success(monkeypatch):
    fake_pool = FakePool()
    gate = threading.BoundedSemaphore(1)
    monkeypatch.setattr(db, "_PG_POOL", fake_pool)
    monkeypatch.setattr(db, "_PG_POOL_GATE", gate)
    monkeypatch.setattr(db, "_PG_POOL_WAIT_TIMEOUT_SECONDS", 0.01)

    with db.conn_scope() as conn:
        assert isinstance(conn, FakeConnection)
        assert conn.autocommit is False

    assert fake_pool.put_count == 1
    assert fake_pool.connections[0].committed is True
    assert gate.acquire(blocking=False)
    gate.release()


def test_app_maps_database_pool_errors_to_503():
    app = create_app()

    @app.get("/__test_pool_error", include_in_schema=False)
    def _raise_pool_error():
        raise psycopg2.pool.PoolError("connection pool exhausted")

    with TestClient(app) as client:
        response = client.get("/__test_pool_error")

    assert response.status_code == 503
    assert response.json() == {"detail": "数据库连接繁忙，请稍后重试"}
