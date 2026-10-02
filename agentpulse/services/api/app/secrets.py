"""模型凭证的加密存取。

三条硬规矩：
  1. 明文**只**在两个地方出现：老板输入的那一刻，和交给 dsh 子进程的环境变量里。
     不落库、不进日志、不经任何 GET 接口返回。
  2. 读接口只返回「有没有设置」和末四位 —— 让老板认出自己填的是哪把，仅此而已。
  3. 加密密钥是机器本地文件，0600。本地优先的应用，密钥跟着机器走，
     不跟着数据库走 —— 数据库被拷走也解不开。
"""

from __future__ import annotations

import os
import sqlite3
import stat
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

from app.db import now


class SecretsError(RuntimeError):
    pass


def _key_file(home: Path) -> Path:
    return home / "secret.key"


def load_cipher(home: str | os.PathLike[str]) -> Fernet:
    """取（或首次生成）本机加密密钥。"""
    home = Path(home)
    home.mkdir(parents=True, exist_ok=True)
    path = _key_file(home)
    if not path.exists():
        path.write_bytes(Fernet.generate_key())
        path.chmod(stat.S_IRUSR | stat.S_IWUSR)   # 0600，别让同机其他用户读到
    mode = path.stat().st_mode & 0o777
    if mode & 0o077:
        # 权限被放宽过就拒绝启动 —— 静默继续等于把密钥摊开
        raise SecretsError(f"{path} 权限是 {oct(mode)}，应为 0600")
    return Fernet(path.read_bytes())


def put_key(conn: sqlite3.Connection, cipher: Fernet, *, scope: str, scope_id: str,
            plaintext: str, base_url: str | None = None) -> None:
    """存一把 key。明文进来、密文出去，中间不打日志。"""
    value = plaintext.strip()
    if not value:
        raise SecretsError("key 是空的")
    conn.execute(
        "INSERT INTO model_keys (scope, scope_id, ciphertext, tail, base_url, updated_at) "
        "VALUES (?,?,?,?,?,?) "
        "ON CONFLICT(scope, scope_id) DO UPDATE SET "
        "  ciphertext = excluded.ciphertext, tail = excluded.tail, "
        "  base_url = excluded.base_url, updated_at = excluded.updated_at",
        (scope, scope_id, cipher.encrypt(value.encode()).decode(),
         value[-4:], base_url, now()))


def drop_key(conn: sqlite3.Connection, *, scope: str, scope_id: str) -> bool:
    cur = conn.execute("DELETE FROM model_keys WHERE scope = ? AND scope_id = ?",
                       (scope, scope_id))
    return cur.rowcount == 1


def describe(conn: sqlite3.Connection, *, scope: str, scope_id: str) -> dict | None:
    """给界面看的：有没有、末四位、什么时候改的。**不含明文。**"""
    row = conn.execute(
        "SELECT tail, base_url, updated_at FROM model_keys WHERE scope = ? AND scope_id = ?",
        (scope, scope_id)).fetchone()
    return None if row is None else {
        "tail": row["tail"], "base_url": row["base_url"], "updated_at": row["updated_at"],
    }


def resolve(conn: sqlite3.Connection, cipher: Fernet, *, agent_id: str,
            workspace_id: str) -> tuple[str | None, str | None]:
    """解出某员工该用的 (key, base_url)：员工级优先，否则公司级。

    两级都没有则返回 (None, None) —— 调用方回落到环境变量（开发时方便），
    但打包后的 app 里环境变量是空的，所以界面上必须填。
    """
    for scope, sid in (("agent", agent_id), ("workspace", workspace_id)):
        row = conn.execute(
            "SELECT ciphertext, base_url FROM model_keys WHERE scope = ? AND scope_id = ?",
            (scope, sid)).fetchone()
        if row is None:
            continue
        try:
            return cipher.decrypt(row["ciphertext"].encode()).decode(), row["base_url"]
        except InvalidToken as exc:
            # 密钥换过或密文损坏。宁可报错，也别静默回落到别人的 key。
            raise SecretsError(
                f"{scope} 的凭证解不开 —— secret.key 换过了？请重新填一次") from exc
    return None, None
