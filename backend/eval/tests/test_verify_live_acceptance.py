import json
from pathlib import Path

from eval.verify_live_acceptance import verify_run


def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def _catalog(catalog_root: Path) -> None:
    _write_json(
        catalog_root / "数码" / "data" / "p1.json",
        {
            "product_id": "p1",
            "title": "测试平板电脑",
            "base_price": 3999,
            "skus": [{"sku_id": "s1", "price": 3299}],
        },
    )


def test_verify_run_checks_route_catalog_price_budget_and_latency(tmp_path: Path) -> None:
    run_dir = tmp_path / "run"
    catalog_root = tmp_path / "catalog"
    _catalog(catalog_root)
    _write_json(
        run_dir / "recommend.json",
        {
            "case": "recommend",
            "expected_tool": "recommend",
            "budget": 3500,
            "status": 200,
            "elapsed_seconds": 1.25,
            "response": {
                "decision": {"tool": "recommend"},
                "tool_result": {
                    "payload": {
                        "products": [
                            {"product_id": "p1", "title": "测试平板电脑", "price": 3299}
                        ]
                    }
                },
                "trace": {"timings": {"router_ms": 100}},
            },
        },
    )
    _write_json(
        run_dir / "invalid_empty.json",
        {
            "case": "invalid_empty",
            "expected_tool": None,
            "status": 400,
            "elapsed_seconds": 0.01,
            "response": {"detail": "query required"},
        },
    )

    summary = verify_run(run_dir, catalog_root)

    assert summary["text_case_count"] == 1
    assert summary["route_matches"] == 1
    assert summary["invalid_input_passed"] is True
    assert summary["card_check_total"] == 1
    assert summary["card_check_passed"] == 1
    assert summary["latency_seconds"] == {"min": 1.25, "median": 1.25, "max": 1.25}
    assert summary["trace_error_count"] == 0
    assert summary["failures"] == []


def test_verify_run_reports_route_and_product_contract_failures(tmp_path: Path) -> None:
    run_dir = tmp_path / "run"
    catalog_root = tmp_path / "catalog"
    _catalog(catalog_root)
    _write_json(
        run_dir / "recommend.json",
        {
            "case": "recommend",
            "expected_tool": "recommend",
            "budget": 3000,
            "status": 200,
            "elapsed_seconds": 2.0,
            "response": {
                "decision": {"tool": "fallback"},
                "tool_result": {
                    "payload": {
                        "products": [
                            {"product_id": "p1", "title": "错误标题", "price": 3999}
                        ]
                    }
                },
                "trace": {"router_error": "timeout"},
            },
        },
    )

    summary = verify_run(run_dir, catalog_root)

    assert summary["route_matches"] == 0
    assert summary["card_check_passed"] == 0
    assert summary["trace_error_count"] == 1
    assert any("route mismatch" in failure for failure in summary["failures"])
    assert any("title mismatch" in failure for failure in summary["failures"])
    assert any("exceeds budget" in failure for failure in summary["failures"])
    assert any("trace error" in failure for failure in summary["failures"])
