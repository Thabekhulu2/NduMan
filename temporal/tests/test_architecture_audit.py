"""Unit tests for scripts/audit/*.py — the checks the Architecture Audit workflow runs.

Each check's `run(root)` takes an arbitrary repo root, so these build small synthetic
repo trees under tmp_path rather than asserting anything about this repo's own content
(the audit is report-only and this repo's findings are expected to change over time).
"""
from __future__ import annotations

import sys
from pathlib import Path

AUDIT_DIR = Path(__file__).resolve().parents[2] / "scripts" / "audit"
sys.path.insert(0, str(AUDIT_DIR))

import check_temporal_registration  # noqa: E402
import check_view_security_invoker  # noqa: E402
import check_workflow_security  # noqa: E402


# ---------------------------------------------------------------------------
# check_temporal_registration
# ---------------------------------------------------------------------------


def _write_worker(root: Path, workflows: str = "", activities: str = "") -> None:
    src = root / "temporal" / "src"
    src.mkdir(parents=True, exist_ok=True)
    (src / "worker.py").write_text(
        "from temporalio.worker import Worker\n\n"
        "worker = Worker(\n"
        "    client,\n"
        f"    workflows=[{workflows}],\n"
        f"    activities=[{activities}],\n"
        ")\n",
        encoding="utf-8",
    )


def test_temporal_registration_flags_unregistered_workflow(tmp_path: Path) -> None:
    workflows_dir = tmp_path / "temporal" / "src" / "workflows"
    workflows_dir.mkdir(parents=True)
    (workflows_dir / "orphan.py").write_text(
        "from temporalio import workflow\n\n"
        "@workflow.defn\n"
        "class OrphanWorkflow:\n"
        "    pass\n",
        encoding="utf-8",
    )
    _write_worker(tmp_path)

    result = check_temporal_registration.run(tmp_path)

    assert not result.ok
    messages = [f.message for f in result.findings]
    assert any("OrphanWorkflow" in m and "not registered" in m for m in messages)
    assert all(f.severity == "CRITICAL" for f in result.findings)


def test_temporal_registration_flags_unregistered_activity(tmp_path: Path) -> None:
    activities_dir = tmp_path / "temporal" / "src" / "activities"
    activities_dir.mkdir(parents=True)
    (activities_dir / "orphan.py").write_text(
        "from temporalio import activity\n\n"
        "@activity.defn\n"
        "def orphan_activity():\n"
        "    pass\n",
        encoding="utf-8",
    )
    _write_worker(tmp_path)

    result = check_temporal_registration.run(tmp_path)

    assert not result.ok
    assert any(
        f.severity == "HIGH" and "orphan_activity" in f.message for f in result.findings
    )


def test_temporal_registration_clean_when_everything_registered(tmp_path: Path) -> None:
    workflows_dir = tmp_path / "temporal" / "src" / "workflows"
    activities_dir = tmp_path / "temporal" / "src" / "activities"
    workflows_dir.mkdir(parents=True)
    activities_dir.mkdir(parents=True)
    (workflows_dir / "greet.py").write_text(
        "from temporalio import workflow\n\n"
        "@workflow.defn\n"
        "class GreetWorkflow:\n"
        "    pass\n",
        encoding="utf-8",
    )
    (activities_dir / "greet.py").write_text(
        "from temporalio import activity\n\n"
        "@activity.defn\n"
        "def say_hello():\n"
        "    pass\n",
        encoding="utf-8",
    )
    _write_worker(tmp_path, workflows="GreetWorkflow", activities="say_hello")

    result = check_temporal_registration.run(tmp_path)

    assert result.ok
    assert result.findings == []


def test_temporal_registration_handles_missing_worker(tmp_path: Path) -> None:
    # No temporal/src at all — should not raise, just report nothing to check.
    result = check_temporal_registration.run(tmp_path)
    assert result.ok


# ---------------------------------------------------------------------------
# check_view_security_invoker
# ---------------------------------------------------------------------------


def _write_migration(root: Path, name: str, sql: str) -> None:
    migrations_dir = root / "supabase" / "migrations"
    migrations_dir.mkdir(parents=True, exist_ok=True)
    (migrations_dir / name).write_text(sql, encoding="utf-8")


def test_view_security_invoker_flags_view_without_security_invoker(tmp_path: Path) -> None:
    _write_migration(
        tmp_path,
        "0001_view.sql",
        "create view public.candidate_summary as\n  select * from entities;\n",
    )

    result = check_view_security_invoker.run(tmp_path)

    assert not result.ok
    assert result.findings[0].severity == "HIGH"
    assert "candidate_summary" in result.findings[0].message


def test_view_security_invoker_allows_view_with_security_invoker(tmp_path: Path) -> None:
    _write_migration(
        tmp_path,
        "0001_view.sql",
        "create view public.candidate_summary with (security_invoker = true) as\n"
        "  select * from entities;\n",
    )

    result = check_view_security_invoker.run(tmp_path)

    assert result.ok


def test_view_security_invoker_handles_create_or_replace(tmp_path: Path) -> None:
    _write_migration(
        tmp_path,
        "0002_view.sql",
        "create or replace view public.jd_summary as\n  select * from entities;\n",
    )

    result = check_view_security_invoker.run(tmp_path)

    assert not result.ok
    assert "jd_summary" in result.findings[0].message


def test_view_security_invoker_no_migrations_dir(tmp_path: Path) -> None:
    result = check_view_security_invoker.run(tmp_path)
    assert result.ok


# ---------------------------------------------------------------------------
# check_workflow_security
# ---------------------------------------------------------------------------


def _write_workflow(root: Path, name: str, yaml: str) -> None:
    workflows_dir = root / ".github" / "workflows"
    workflows_dir.mkdir(parents=True, exist_ok=True)
    (workflows_dir / name).write_text(yaml, encoding="utf-8")


def test_workflow_security_flags_pull_request_target_with_secrets(tmp_path: Path) -> None:
    _write_workflow(
        tmp_path,
        "risky.yml",
        "on:\n  pull_request_target:\n"
        "jobs:\n  build:\n    steps:\n      - run: echo ${{ secrets.DEPLOY_TOKEN }}\n",
    )

    result = check_workflow_security.run(tmp_path)

    assert not result.ok
    crit = [f for f in result.findings if f.severity == "CRITICAL"]
    assert len(crit) == 1
    assert "DEPLOY_TOKEN" in crit[0].message


def test_workflow_security_flags_permissions_write_all(tmp_path: Path) -> None:
    _write_workflow(
        tmp_path,
        "broad.yml",
        "on:\n  push:\npermissions: write-all\njobs:\n  build:\n    steps: []\n",
    )

    result = check_workflow_security.run(tmp_path)

    assert not result.ok
    assert any(f.severity == "HIGH" and "write-all" in f.message for f in result.findings)


def test_workflow_security_allows_pull_request_target_without_secrets(tmp_path: Path) -> None:
    _write_workflow(
        tmp_path,
        "safe.yml",
        "on:\n  pull_request_target:\njobs:\n  build:\n    steps:\n      - run: echo hi\n",
    )

    result = check_workflow_security.run(tmp_path)

    assert result.ok


def test_workflow_security_no_workflows_dir(tmp_path: Path) -> None:
    result = check_workflow_security.run(tmp_path)
    assert result.ok
