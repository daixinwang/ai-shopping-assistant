"""Verify saved live-acceptance evidence against the tracked product catalog."""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]


def _read_json(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise ValueError(f"Expected a JSON object: {path}")
    return payload


def _load_catalog(catalog_root: Path) -> dict[str, dict[str, Any]]:
    catalog: dict[str, dict[str, Any]] = {}
    for path in sorted(catalog_root.glob("*/data/*.json")):
        product = _read_json(path)
        product_id = str(product.get("product_id", "")).strip()
        if product_id:
            catalog[product_id] = product
    if not catalog:
        raise ValueError(f"No product JSON files found under {catalog_root}")
    return catalog


def _trace_errors(value: Any, prefix: str = "trace") -> list[str]:
    errors: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            child_prefix = f"{prefix}.{key}"
            if key.endswith("_error") and child:
                errors.append(child_prefix)
            errors.extend(_trace_errors(child, child_prefix))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            errors.extend(_trace_errors(child, f"{prefix}[{index}]"))
    return errors


def _catalog_prices(product: dict[str, Any]) -> set[float]:
    prices: set[float] = set()
    for candidate in [product.get("base_price")]:
        if isinstance(candidate, (int, float)):
            prices.add(float(candidate))
    for sku in product.get("skus", []):
        candidate = sku.get("price") if isinstance(sku, dict) else None
        if isinstance(candidate, (int, float)):
            prices.add(float(candidate))
    return prices


def verify_run(run_dir: Path, catalog_root: Path) -> dict[str, Any]:
    run_dir = run_dir.resolve()
    catalog = _load_catalog(catalog_root.resolve())
    rows = []
    for path in sorted(run_dir.glob("*.json")):
        if path.name in {"manifest.json", "verified-metrics.json"}:
            continue
        row = _read_json(path)
        if row.get("case"):
            rows.append(row)

    failures: list[str] = []
    route_matches = 0
    text_rows = [row for row in rows if isinstance(row.get("expected_tool"), str)]
    latencies: list[float] = []
    card_checks: list[dict[str, Any]] = []
    trace_error_count = 0

    for row in text_rows:
        case = str(row["case"])
        response = row.get("response") if isinstance(row.get("response"), dict) else {}
        expected_tool = row["expected_tool"]
        actual_tool = (response.get("decision") or {}).get("tool")
        if row.get("status") != 200:
            failures.append(f"{case}: expected HTTP 200, got {row.get('status')}")
        if actual_tool == expected_tool:
            route_matches += 1
        else:
            failures.append(
                f"{case}: route mismatch, expected {expected_tool}, got {actual_tool}"
            )

        elapsed = row.get("elapsed_seconds")
        if isinstance(elapsed, (int, float)):
            latencies.append(float(elapsed))

        trace_paths = _trace_errors(response.get("trace", {}))
        trace_error_count += len(trace_paths)
        for trace_path in trace_paths:
            failures.append(f"{case}: trace error at {trace_path}")

        payload = ((response.get("tool_result") or {}).get("payload") or {})
        products = payload.get("products", []) if isinstance(payload, dict) else []
        budget = row.get("budget")
        for returned in products if isinstance(products, list) else []:
            if not isinstance(returned, dict):
                continue
            product_id = str(returned.get("product_id", ""))
            source = catalog.get(product_id)
            exists = source is not None
            title_matches = exists and returned.get("title") == source.get("title")
            price = returned.get("price")
            price_in_skus = (
                exists
                and isinstance(price, (int, float))
                and float(price) in _catalog_prices(source)
            )
            within_budget = (
                budget is None
                or (isinstance(price, (int, float)) and float(price) <= float(budget))
            )
            passed = bool(exists and title_matches and price_in_skus and within_budget)
            check = {
                "case": case,
                "product_id": product_id,
                "exists": exists,
                "title_matches": title_matches,
                "price_in_skus": price_in_skus,
                "within_budget": within_budget,
                "passed": passed,
            }
            card_checks.append(check)
            if not exists:
                failures.append(f"{case}/{product_id}: product ID missing from catalog")
            if exists and not title_matches:
                failures.append(f"{case}/{product_id}: title mismatch")
            if exists and not price_in_skus:
                failures.append(f"{case}/{product_id}: price is not a catalog SKU price")
            if not within_budget:
                failures.append(f"{case}/{product_id}: price exceeds budget {budget}")

    invalid_row = next((row for row in rows if row.get("case") == "invalid_empty"), None)
    invalid_input_passed = bool(invalid_row and invalid_row.get("status") == 400)
    if not invalid_input_passed:
        failures.append("invalid_empty: expected HTTP 400")

    image_row = next((row for row in rows if row.get("case") == "image"), None)
    image_transport = {
        "executed": image_row is not None,
        "http_ok": bool(image_row and image_row.get("status") == 200),
        "stream_completed": bool(image_row and "event: done" in str(image_row.get("sse", ""))),
        "elapsed_seconds": image_row.get("elapsed_seconds") if image_row else None,
        "relevance_reviewed": False,
    }

    latency = {
        "min": min(latencies) if latencies else None,
        "median": statistics.median(latencies) if latencies else None,
        "max": max(latencies) if latencies else None,
    }
    return {
        "text_case_count": len(text_rows),
        "route_matches": route_matches,
        "route_total": len(text_rows),
        "invalid_input_passed": invalid_input_passed,
        "card_check_total": len(card_checks),
        "card_check_passed": sum(1 for check in card_checks if check["passed"]),
        "card_checks": card_checks,
        "latency_seconds": latency,
        "trace_error_count": trace_error_count,
        "image_transport": image_transport,
        "failures": failures,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--catalog-root", type=Path, default=REPO_ROOT / "data")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    summary = verify_run(args.run_dir, args.catalog_root)
    output = args.output or args.run_dir / "verified-metrics.json"
    output.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if summary["failures"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
