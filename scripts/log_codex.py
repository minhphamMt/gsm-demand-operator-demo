#!/usr/bin/env python3
"""Recover recent Codex prompt/stop events from local session transcripts.

This pre-push safety net covers cases where a project-local Codex hook has not
been trusted yet. Existing live or archived entries are deduplicated by
session, event, and turn id.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections.abc import Iterable
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

VN_TZ = timezone(timedelta(hours=7))


def git(*args: str) -> str:
    try:
        return subprocess.check_output(
            ["git", *args], text=True, stderr=subprocess.DEVNULL
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return ""


def parse_timestamp(value: str) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def normalize_remote(value: str) -> str:
    normalized = value.strip().rstrip("/").lower()
    return normalized[:-4] if normalized.endswith(".git") else normalized


def iter_jsonl(path: Path) -> Iterable[dict[str, Any]]:
    try:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                try:
                    value = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(value, dict):
                    yield value
    except OSError:
        return


def entry_key(entry: dict[str, Any]) -> tuple[str, ...]:
    session_id = str(entry.get("session_id", ""))
    event = str(entry.get("event", ""))
    turn_id = str(entry.get("turn_id", ""))
    if turn_id:
        return session_id, event, turn_id
    return session_id, event, str(entry.get("ts", "")), str(entry.get("prompt", ""))


def load_seen(log_dir: Path) -> set[tuple[str, ...]]:
    seen: set[tuple[str, ...]] = set()
    candidates = [log_dir / "session.jsonl"]
    candidates.extend(log_dir.glob("session.pending.*.jsonl"))
    candidates.extend((log_dir / "archive").glob("*.jsonl"))
    for path in candidates:
        for entry in iter_jsonl(path):
            seen.add(entry_key(entry))
    return seen


def first_record(path: Path) -> dict[str, Any] | None:
    try:
        with path.open(encoding="utf-8") as handle:
            value = json.loads(next(handle))
            return value if isinstance(value, dict) else None
    except (OSError, StopIteration, json.JSONDecodeError):
        return None


def session_matches(meta: dict[str, Any], repo_root: Path, remote: str) -> bool:
    if meta.get("thread_source") != "user":
        return False
    session_remote = normalize_remote(str((meta.get("git") or {}).get("repository_url", "")))
    if remote and session_remote:
        return session_remote == remote
    try:
        return Path(str(meta.get("cwd", ""))).resolve() == repo_root.resolve()
    except OSError:
        return False


def session_entries(
    path: Path,
    meta: dict[str, Any],
    cutoff: datetime,
    repo: str,
    student: str,
) -> list[dict[str, Any]]:
    turns: list[dict[str, Any]] = []
    users: list[tuple[str, str]] = []
    stops: list[tuple[str, dict[str, Any]]] = []

    for record in iter_jsonl(path):
        record_type = record.get("type")
        payload = record.get("payload") or {}
        if record_type == "turn_context":
            turns.append(payload)
        elif record_type == "event_msg" and payload.get("type") == "user_message":
            users.append((str(record.get("timestamp", "")), str(payload.get("message", ""))))
        elif record_type == "event_msg" and payload.get("type") in {"task_complete", "turn_aborted"}:
            stops.append((str(record.get("timestamp", "")), payload))

    session_id = str(meta.get("session_id") or meta.get("id") or "")
    git_meta = meta.get("git") or {}
    branch = str(git_meta.get("branch", ""))
    commit = str(git_meta.get("commit_hash", ""))[:7]
    default_model = next((str(turn.get("model")) for turn in turns if turn.get("model")), "")
    model_by_turn = {
        str(turn.get("turn_id", "")): str(turn.get("model", default_model))
        for turn in turns
    }
    entries: list[dict[str, Any]] = []

    for index, (timestamp, prompt) in enumerate(users):
        occurred_at = parse_timestamp(timestamp)
        if occurred_at is None or occurred_at < cutoff or not prompt.strip():
            continue
        turn = turns[index] if index < len(turns) else {}
        entries.append(
            {
                "ts": occurred_at.astimezone(VN_TZ).isoformat(),
                "tool": "codex",
                "event": "UserPromptSubmit",
                "session_id": session_id,
                "model": str(turn.get("model", default_model)),
                "repo": repo,
                "branch": branch,
                "commit": commit,
                "student": student,
                "prompt": prompt[:1000],
                "turn_id": str(turn.get("turn_id", "")),
                "transcript_path": str(path),
            }
        )

    for timestamp, payload in stops:
        occurred_at = parse_timestamp(timestamp)
        if occurred_at is None or occurred_at < cutoff:
            continue
        turn_id = str(payload.get("turn_id", ""))
        entries.append(
            {
                "ts": occurred_at.astimezone(VN_TZ).isoformat(),
                "tool": "codex",
                "event": "Stop",
                "session_id": session_id,
                "model": model_by_turn.get(turn_id, default_model),
                "repo": repo,
                "branch": branch,
                "commit": commit,
                "student": student,
                "prompt": "",
                "turn_id": turn_id,
                "transcript_path": str(path),
            }
        )
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--auto", action="store_true", help="Sweep recent Codex transcripts")
    parser.add_argument(
        "--hours",
        type=float,
        default=float(os.environ.get("AI_LOG_CODEX_LOOKBACK_HOURS", "24")),
    )
    args = parser.parse_args()
    if not args.auto:
        parser.error("use --auto")

    repo_root_value = git("rev-parse", "--show-toplevel")
    remote = normalize_remote(git("remote", "get-url", "origin"))
    if not repo_root_value or not remote:
        print("[ai-log] Codex sweep skipped: git repo/origin not found.", file=sys.stderr)
        return

    repo_root = Path(repo_root_value)
    repo = remote.rsplit("/", 1)[-1]
    student = git("config", "user.email")
    log_dir = Path(os.environ.get("AI_LOG_DIR", ".ai-log"))
    codex_home = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    cutoff = datetime.now(UTC) - timedelta(hours=max(args.hours, 0))
    cutoff_mtime = cutoff.timestamp()
    seen = load_seen(log_dir)
    recovered: list[dict[str, Any]] = []

    session_files: list[Path] = []
    for folder in (codex_home / "sessions", codex_home / "archived_sessions"):
        if folder.exists():
            session_files.extend(folder.rglob("*.jsonl"))

    for path in session_files:
        try:
            if path.stat().st_mtime < cutoff_mtime:
                continue
        except OSError:
            continue
        first = first_record(path)
        if not first or first.get("type") != "session_meta":
            continue
        meta = first.get("payload") or {}
        if not session_matches(meta, repo_root, remote):
            continue
        for entry in session_entries(path, meta, cutoff, repo, student):
            key = entry_key(entry)
            if key not in seen:
                seen.add(key)
                recovered.append(entry)

    if not recovered:
        print("[ai-log] Codex sweep found no new entries.", file=sys.stderr)
        return

    log_dir.mkdir(parents=True, exist_ok=True)
    with (log_dir / "session.jsonl").open("a", encoding="utf-8", newline="\n") as handle:
        for entry in sorted(recovered, key=lambda item: str(item.get("ts", ""))):
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    print(f"[ai-log] Codex sweep added {len(recovered)} entries.", file=sys.stderr)


if __name__ == "__main__":
    main()
