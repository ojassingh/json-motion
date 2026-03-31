from __future__ import annotations

import json
from numbers import Number

import modal


APP_NAME = "motion-modal-gpu-verify"
DEPLOYED_SUITE_FUNCTION_NAME = "run_benchmark_suite"


def _format_float(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.2f}"


def _format_vram(result: dict[str, object]) -> str:
    used = result.get("gpuVramPeakUsedMiB")
    total = result.get("gpuVramTotalMiB")
    if used is None or total is None:
        return "-"
    return f"{used}/{total}"


def _speedup_string(cpu_value: float | None, gpu_value: float | None) -> str:
    if cpu_value in (None, 0) or gpu_value is None:
        return "-"
    return f"{cpu_value / gpu_value:.2f}x"


def _print_table(results: list[dict[str, object]]) -> None:
    print(
        "case".ljust(14),
        "metric".ljust(20),
        "cpu-same-worker".rjust(16),
        "gpu-same-worker".rjust(16),
        "speedup".rjust(10),
    )
    print(
        "-".ljust(14, "-"),
        "-".ljust(20, "-"),
        "-".rjust(16, "-"),
        "-".rjust(16, "-"),
        "-".rjust(10, "-"),
    )

    for result in results:
        case_name = str(result["case"])
        cpu = result["cpuSameWorker"]
        gpu = result["gpuSameWorker"]
        pixel_diff = result["pixelDiff"]
        assert isinstance(cpu, dict)
        assert isinstance(gpu, dict)
        assert isinstance(pixel_diff, dict)

        rows = [
            (
                "wall_ms",
                cpu.get("wallMs"),
                gpu.get("wallMs"),
                _speedup_string(cpu.get("wallMs"), gpu.get("wallMs")),
            ),
            (
                "render_ms",
                cpu.get("renderMs"),
                gpu.get("renderMs"),
                _speedup_string(cpu.get("renderMs"), gpu.get("renderMs")),
            ),
            (
                "encode_ms",
                cpu.get("encodeMs"),
                gpu.get("encodeMs"),
                _speedup_string(cpu.get("encodeMs"), gpu.get("encodeMs")),
            ),
            ("gpu_vram_mib", None, None, _format_vram(gpu)),
            ("pixel_diff_pass", None, None, "PASS" if pixel_diff.get("pass") else "FAIL"),
        ]

        for index, (metric, cpu_value, gpu_value, extra) in enumerate(rows):
            left_case = case_name if index == 0 else ""
            cpu_str = _format_float(float(cpu_value) if isinstance(cpu_value, Number) else None)
            gpu_str = _format_float(float(gpu_value) if isinstance(gpu_value, Number) else None)
            if metric == "gpu_vram_mib":
                gpu_str = _format_vram(gpu)
            elif metric == "pixel_diff_pass":
                avg_diff = pixel_diff.get("avgChannelDiff")
                changed_ratio = pixel_diff.get("changedPixelRatio")
                if isinstance(avg_diff, Number) and isinstance(changed_ratio, Number):
                    gpu_str = f"{avg_diff:.4f}/{changed_ratio:.4f}"
            print(
                left_case.ljust(14),
                metric.ljust(20),
                cpu_str.rjust(16),
                gpu_str.rjust(16),
                extra.rjust(10),
            )


def main() -> None:
    bench = modal.Function.from_name(APP_NAME, DEPLOYED_SUITE_FUNCTION_NAME)
    payload = bench.remote()
    print(json.dumps(payload, indent=2))
    results = payload.get("results")
    if isinstance(results, list):
        _print_table(results)


if __name__ == "__main__":
    main()
