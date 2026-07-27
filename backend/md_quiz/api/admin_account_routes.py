from __future__ import annotations

from fastapi import APIRouter, Request, status

from . import admin as shared
from backend.md_quiz.storage.db import (
    _hash_admin_password,
    count_admin_users,
    create_admin_user,
    delete_admin_user,
    get_admin_user_by_username,
    list_admin_users,
    update_admin_user_password,
    update_admin_user_role,
)

router = APIRouter()


@router.get("/accounts")
def list_accounts(request: Request):
    shared._require_super_admin(request)
    return {"items": list_admin_users()}


@router.post("/accounts")
def create_account(payload: shared.AdminUserCreatePayload, request: Request):
    shared._require_super_admin(request)
    username = str(payload.username or "").strip()
    if not username:
        raise shared.HTTPException(status_code=400, detail="用户名不能为空")
    existing = get_admin_user_by_username(username)
    if existing:
        raise shared.HTTPException(status_code=409, detail="用户名已存在")
    role = str(payload.role or "").strip().lower()
    if role not in ("admin", "super_admin"):
        role = "admin"
    pwd_hash = _hash_admin_password(payload.password)
    user = create_admin_user(username=username, password_hash=pwd_hash, role=role)
    return {"ok": True, "user": user}


@router.put("/accounts/{user_id}/password")
def update_account_password(user_id: int, payload: shared.AdminUserUpdatePasswordPayload, request: Request):
    shared._require_super_admin(request)
    pwd_hash = _hash_admin_password(payload.password)
    update_admin_user_password(user_id, pwd_hash)
    return {"ok": True}


@router.put("/accounts/{user_id}/role")
def update_account_role(user_id: int, payload: dict, request: Request):
    shared._require_super_admin(request)
    role = str((payload or {}).get("role") or "").strip()
    if role not in ("admin", "super_admin"):
        raise shared.HTTPException(status_code=400, detail="无效角色")
    update_admin_user_role(user_id, role)
    return {"ok": True}


@router.delete("/accounts/{user_id}")
def delete_account(user_id: int, request: Request):
    shared._require_super_admin(request)
    if count_admin_users() <= 1:
        raise shared.HTTPException(status_code=400, detail="不能删除最后一个管理员账户")
    deleted = delete_admin_user(user_id)
    if not deleted:
        raise shared.HTTPException(status_code=404, detail="账户不存在")
    return {"ok": True}
