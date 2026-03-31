from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import modal


ROOT_DIR = Path(__file__).resolve().parents[1]
ENGINE_LOCAL_DIR = ROOT_DIR / "engine"
ENGINE_REMOTE_DIR = Path("/engine")
ENGINE_BINARY_PATH = ENGINE_REMOTE_DIR / "target" / "release" / "engine"

APP_NAME = "motion-modal-gpu-verify"
DEPLOYED_SUITE_FUNCTION_NAME = "run_benchmark_suite"

GPU_TYPE = "L40S"
LONG_CASE_NAME = "long-60s"
LONG_CASE_PARALLEL_WORKERS = 3
GPU_POLL_INTERVAL_SECONDS = 1.0
PERF_CODEC = "h264_nvenc"
VERIFY_CODEC = "libx264"
WORKER_CPU = (4.0, 4.0)
WORKER_MEMORY_MIB = (16_384, 16_384)
# Headless container Vulkan should target NVIDIA's EGL-backed ICD library.
NVIDIA_VULKAN_LIBRARY_NAME = "libEGL_nvidia.so.0"
NVIDIA_VULKAN_MANIFEST_PATH = Path("/etc/vulkan/icd.d/nvidia_icd.json")
NVIDIA_DRIVER_CAPABILITIES_VALUE = "all"
REQUIRE_NVIDIA_VULKAN_ENV = {
    "ENGINE_REQUIRE_NVIDIA_VULKAN": "1",
    "NVIDIA_DRIVER_CAPABILITIES": NVIDIA_DRIVER_CAPABILITIES_VALUE,
    "VK_DRIVER_FILES": str(NVIDIA_VULKAN_MANIFEST_PATH),
    # Ubuntu 22.04's Vulkan stack can still consult the deprecated variable.
    "VK_ICD_FILENAMES": str(NVIDIA_VULKAN_MANIFEST_PATH),
}
VULKAN_MANIFEST_DIRS = (
    Path("/etc/vulkan/icd.d"),
    Path("/usr/share/vulkan/icd.d"),
)
MESA_VULKAN_MANIFEST_PATTERNS = (
    "/etc/vulkan/icd.d/intel*.json",
    "/etc/vulkan/icd.d/lvp*.json",
    "/etc/vulkan/icd.d/radeon*.json",
    "/etc/vulkan/icd.d/virtio*.json",
    "/usr/share/vulkan/icd.d/intel*.json",
    "/usr/share/vulkan/icd.d/lvp*.json",
    "/usr/share/vulkan/icd.d/radeon*.json",
    "/usr/share/vulkan/icd.d/virtio*.json",
)

TIMINGS_RE = re.compile(r"timings:\s+render=([0-9.]+)ms,\s+encode=([0-9.]+)ms")
LINUX_RSS_RE = re.compile(r"Maximum resident set size \(kbytes\):\s+(\d+)", re.IGNORECASE)
BACKEND_RE = re.compile(r"backend=(cpu|gpu) \(([^)]+)\)")


@dataclass(frozen=True)
class PixelDiffThreshold:
    max_avg_channel_diff: float
    max_changed_pixel_ratio: float


@dataclass(frozen=True)
class BenchmarkCase:
    description: dict[str, Any]
    name: str
    threshold: PixelDiffThreshold


def create_base_description() -> dict[str, Any]:
    return {
        "background": "#000000",
        "fps": 60,
        "height": 720,
        "scenes": [],
        "width": 1280,
    }


def create_dense_rect_grid() -> dict[str, Any]:
    description = create_base_description()
    nodes: dict[str, Any] = {}
    node_id = 0

    for row in range(40):
        for col in range(50):
            nodes[f"rect{node_id}"] = {
                "cornerRadius": 2,
                "fill": "#38bdf8" if (row + col) % 2 == 0 else "#f8fafc",
                "height": 10,
                "type": "rect",
                "width": 18,
                "x": 8 + col * 25,
                "y": 8 + row * 17,
            }
            node_id += 1

    description["scenes"].append(
        {
            "duration": 120,
            "id": "scene1",
            "nodes": nodes,
            "startFrame": 0,
            "timeline": [],
        }
    )
    return description


def create_layout_text_stack() -> dict[str, Any]:
    description = create_base_description()
    nodes: dict[str, Any] = {}
    children: list[str] = []

    for index in range(240):
        text_id = f"text{index}"
        children.append(text_id)
        nodes[text_id] = {
            "color": "#f8fafc" if index % 2 == 0 else "#38bdf8",
            "size": 18 + (index % 3),
            "text": f"Row {index} speed benchmark",
            "type": "text",
        }

    nodes["stack"] = {
        "align": "start",
        "children": children,
        "direction": "vertical",
        "gap": 4,
        "type": "stack",
        "width": 420,
    }
    nodes["wrap"] = {
        "children": ["stack"],
        "height": 720,
        "padding": 24,
        "position": "top-left",
        "type": "align",
        "width": 1280,
    }

    description["scenes"].append(
        {
            "duration": 120,
            "id": "scene1",
            "nodes": nodes,
            "startFrame": 0,
            "timeline": [],
        }
    )
    return description


def create_math_complex() -> dict[str, Any]:
    description = create_base_description()
    nodes: dict[str, Any] = {}
    elements = [
        {"d": "M3 12h18", "type": "path"},
        {"d": "M12 3v18", "type": "path"},
        {"d": "M5 6c2-2 4-3 7-3s5 1 7 3", "type": "path"},
        {"d": "M5 18c2 2 4 3 7 3s5-1 7-3", "type": "path"},
        {"d": "M6 8h12", "type": "path"},
        {"d": "M6 16h12", "type": "path"},
    ]
    node_id = 0

    for row in range(12):
        for col in range(16):
            nodes[f"math{node_id}"] = {
                "elements": elements,
                "height": 48,
                "opacity": 0.9,
                "stroke": "#e2e8f0" if row % 2 == 0 else "#38bdf8",
                "strokeWidth": 1.8,
                "type": "icon",
                "width": 48,
                "x": 14 + col * 76,
                "y": 14 + row * 56,
            }
            node_id += 1

    description["scenes"].append(
        {
            "duration": 180,
            "id": "scene1",
            "nodes": nodes,
            "startFrame": 0,
            "timeline": [],
        }
    )
    return description


def create_mixed_dense() -> dict[str, Any]:
    description = create_base_description()
    nodes: dict[str, Any] = {}
    timeline: list[dict[str, Any]] = []
    icon_elements = [
        {"d": "M5 12h14", "type": "path"},
        {"d": "m12 5 7 7-7 7", "type": "path"},
    ]

    rect_id = 0
    for row in range(18):
        for col in range(24):
            node_key = f"rect{rect_id}"
            nodes[node_key] = {
                "cornerRadius": 4,
                "fill": "#0f172a" if (row + col) % 2 == 0 else "#38bdf8",
                "height": 18,
                "opacity": 0.8,
                "type": "rect",
                "width": 18,
                "x": 18 + col * 50,
                "y": 18 + row * 36,
            }
            rect_id += 1

    for index in range(80):
        nodes[f"label{index}"] = {
            "color": "#f8fafc" if index % 2 == 0 else "#cbd5e1",
            "size": 16 + (index % 4),
            "text": f"Segment {index}",
            "type": "text",
            "x": 24 + (index % 10) * 120,
            "y": 30 + (index // 10) * 58,
        }

    for index in range(90):
        nodes[f"icon{index}"] = {
            "elements": icon_elements,
            "height": 28,
            "opacity": 0.9,
            "stroke": "#f8fafc",
            "strokeWidth": 2,
            "type": "icon",
            "width": 28,
            "x": 30 + (index % 15) * 82,
            "y": 420 + (index // 15) * 40,
        }

    timeline.append(
        {
            "at": 0.2,
            "dur": 0.6,
            "dx": 10,
            "ease": "ease-in-out",
            "target": [key for key in nodes if key.startswith("rect")],
        }
    )

    description["scenes"].append(
        {
            "duration": 360,
            "id": "scene1",
            "nodes": nodes,
            "startFrame": 0,
            "timeline": timeline,
        }
    )
    return description


def create_long_60s() -> dict[str, Any]:
    description = create_mixed_dense()
    description["scenes"][0] = {
        **description["scenes"][0],
        "duration": 3600,
    }
    return description


def create_mixed_static_long() -> dict[str, Any]:
    description = create_mixed_dense()
    description["scenes"][0] = {
        **description["scenes"][0],
        "duration": 3600,
        "timeline": [],
    }
    return description


def create_rect_animate_long() -> dict[str, Any]:
    description = create_base_description()
    nodes: dict[str, Any] = {}

    rect_id = 0
    for row in range(24):
        for col in range(30):
            node_key = f"rect{rect_id}"
            nodes[node_key] = {
                "cornerRadius": 4,
                "fill": "#0f172a" if (row + col) % 2 == 0 else "#38bdf8",
                "height": 18,
                "opacity": 0.85,
                "type": "rect",
                "width": 18,
                "x": 18 + col * 40,
                "y": 18 + row * 28,
            }
            rect_id += 1

    description["scenes"].append(
        {
            "duration": 3600,
            "id": "scene1",
            "nodes": nodes,
            "startFrame": 0,
            "timeline": [
                {
                    "at": 0.15,
                    "dur": 0.7,
                    "dx": 12,
                    "ease": "ease-in-out",
                    "target": list(nodes.keys()),
                }
            ],
        }
    )
    return description


def build_cases() -> list[BenchmarkCase]:
    return [
        BenchmarkCase(
            name="rect-stress",
            description=create_dense_rect_grid(),
            threshold=PixelDiffThreshold(6, 0.08),
        ),
        BenchmarkCase(
            name="text-heavy",
            description=create_layout_text_stack(),
            threshold=PixelDiffThreshold(10, 0.18),
        ),
        BenchmarkCase(
            name="math-complex",
            description=create_math_complex(),
            threshold=PixelDiffThreshold(14, 0.24),
        ),
        BenchmarkCase(
            name="mixed-dense",
            description=create_mixed_dense(),
            threshold=PixelDiffThreshold(14, 0.22),
        ),
        BenchmarkCase(
            name="mixed-static-long",
            description=create_mixed_static_long(),
            threshold=PixelDiffThreshold(14, 0.22),
        ),
        BenchmarkCase(
            name="rect-animate-long",
            description=create_rect_animate_long(),
            threshold=PixelDiffThreshold(8, 0.12),
        ),
        BenchmarkCase(
            name=LONG_CASE_NAME,
            description=create_long_60s(),
            threshold=PixelDiffThreshold(14, 0.22),
        ),
    ]


CASES = build_cases()
CASES_BY_NAME = {case.name: case for case in CASES}


app = modal.App(APP_NAME)
base_image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.3.2-devel-ubuntu22.04",
        add_python="3.12",
    )
    .entrypoint([])
    .apt_install(
        "ca-certificates",
        "curl",
        "build-essential",
        "pkg-config",
        "clang",
        "time",
        "ffmpeg",
        "git",
        "libc-bin",
        "libssl-dev",
        "libfontconfig1-dev",
        "libavcodec-dev",
        "libavdevice-dev",
        "libavfilter-dev",
        "libavformat-dev",
        "libavutil-dev",
        "libswscale-dev",
        "libvulkan1",
        "libvulkan-dev",
        "libxext6",
        "python3",
    )
    .pip_install("fastapi[standard]")
    .run_commands(
        "mkdir -p /etc/vulkan/icd.d && "
        "printf '%s' '{\"file_format_version\":\"1.0.0\",\"ICD\":{\"library_path\":\"libEGL_nvidia.so.0\",\"api_version\":\"1.3.0\"}}' "
        "> /etc/vulkan/icd.d/nvidia_icd.json"
    )
    .run_commands(f"rm -f {' '.join(MESA_VULKAN_MANIFEST_PATTERNS)}")
    .env(
        {
            "PATH": "/root/.cargo/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
            **REQUIRE_NVIDIA_VULKAN_ENV,
        }
    )
    .run_commands("curl https://sh.rustup.rs -sSf | sh -s -- -y --default-toolchain stable")
)
engine_image = (
    base_image
    .add_local_dir(str(ENGINE_LOCAL_DIR), "/engine", copy=True)
    .run_commands("cd /engine && cargo build --release --features gpu")
)


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload), encoding="utf8")


def _run_command(
    args: list[str],
    *,
    env: dict[str, str] | None = None,
    cwd: str | None = None,
    encoding: str | None = "utf8",
) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        args,
        check=False,
        cwd=cwd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=encoding is not None,
        encoding=encoding,
    )


def _discover_vulkan_driver_manifests() -> list[str]:
    manifests: list[str] = []
    for directory in VULKAN_MANIFEST_DIRS:
        if not directory.exists():
            continue
        manifests.extend(sorted(str(path) for path in directory.glob("*.json")))
    return manifests


def _detect_nvidia_vulkan_driver_manifest() -> str | None:
    for manifest in _discover_vulkan_driver_manifests():
        if "nvidia" in Path(manifest).name.lower():
            return manifest
    return None


def _discover_dynamic_library_entries(library_name: str) -> list[str]:
    ldconfig_path = (
        shutil.which("ldconfig")
        or ("/usr/sbin/ldconfig" if Path("/usr/sbin/ldconfig").exists() else None)
        or ("/sbin/ldconfig" if Path("/sbin/ldconfig").exists() else None)
    )
    if ldconfig_path is None:
        return []
    result = _run_command([ldconfig_path, "-p"])
    if result.returncode != 0:
        return []
    return [line.strip() for line in result.stdout.splitlines() if library_name in line]


def _probe_dynamic_library_load(library_name: str) -> tuple[bool, str]:
    result = _run_command(
        [
            "python3",
            "-c",
            (
                "import ctypes; "
                f"ctypes.CDLL('{library_name}'); "
                "print('ok')"
            ),
        ]
    )
    stderr = result.stderr.strip()
    if result.returncode != 0:
        return (False, stderr)
    return (True, stderr)


def _query_gpu_memory() -> tuple[int | None, int | None]:
    result = _run_command(
        [
            "nvidia-smi",
            "--query-gpu=memory.used,memory.total",
            "--format=csv,noheader,nounits",
        ]
    )
    if result.returncode != 0 or not result.stdout:
        return (None, None)

    first_line = result.stdout.strip().splitlines()[0]
    used_str, total_str = [part.strip() for part in first_line.split(",", maxsplit=1)]
    return (int(used_str), int(total_str))


def _watch_gpu_memory(
    stop_event: threading.Event,
    samples: list[tuple[int, int]],
    poll_interval_seconds: float,
) -> None:
    while not stop_event.is_set():
        used, total = _query_gpu_memory()
        if used is not None and total is not None:
            samples.append((used, total))
        stop_event.wait(poll_interval_seconds)


def _extract_first_frame(video_path: Path) -> bytes:
    result = _run_command(
        [
            "ffmpeg",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgba",
            "-",
        ],
        encoding=None,
    )
    if result.returncode != 0:
        stderr = result.stderr.decode("utf8", errors="replace") if result.stderr else ""
        raise RuntimeError(f"ffmpeg frame extraction failed for {video_path}: {stderr.strip()}")
    return result.stdout


def _compute_pixel_diff(cpu_frame: bytes, gpu_frame: bytes) -> dict[str, float]:
    if len(cpu_frame) != len(gpu_frame):
        raise RuntimeError("CPU/GPU frame sizes differ")

    total_channel_diff = 0
    changed_pixels = 0
    pixel_count = len(cpu_frame) // 4

    for offset in range(0, len(cpu_frame), 4):
        pixel_diff = 0
        for channel in range(4):
            pixel_diff += abs(cpu_frame[offset + channel] - gpu_frame[offset + channel])
        total_channel_diff += pixel_diff
        if pixel_diff > 48:
            changed_pixels += 1

    return {
        "avgChannelDiff": round(total_channel_diff / len(cpu_frame), 4),
        "changedPixelRatio": round(changed_pixels / pixel_count, 4),
    }


def _make_verify_case(description: dict[str, Any]) -> dict[str, Any]:
    description = json.loads(json.dumps(description))
    first_scene = description["scenes"][0]
    description["scenes"][0] = {**first_scene, "duration": 1}
    return description


def _parse_engine_metrics(stderr: str) -> tuple[float, float, int | None, str | None]:
    timings_match = TIMINGS_RE.search(stderr)
    if timings_match is None:
        raise RuntimeError(f"engine did not emit timing output:\n{stderr}")

    rss_match = LINUX_RSS_RE.search(stderr)
    backend_match = BACKEND_RE.search(stderr)
    backend_label = None
    if backend_match is not None:
        backend_label = f"{backend_match.group(1)}:{backend_match.group(2)}"

    max_rss_kb = int(rss_match.group(1)) if rss_match is not None else None
    return (
        float(timings_match.group(1)),
        float(timings_match.group(2)),
        max_rss_kb,
        backend_label,
    )


def _speedup_string(cpu_value: float | None, gpu_value: float | None) -> str:
    if cpu_value in (None, 0) or gpu_value is None:
        return "-"
    return f"{cpu_value / gpu_value:.2f}x"


def _format_float(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:.2f}"


def _format_vram(result: dict[str, Any]) -> str:
    used = result.get("gpuVramPeakUsedMiB")
    total = result.get("gpuVramTotalMiB")
    if used is None or total is None:
        return "-"
    return f"{used}/{total}"


def _log_modal_event(event: str, payload: dict[str, Any]) -> None:
    print(f"[{event}] {json.dumps(payload, sort_keys=True)}", flush=True)


def _build_suite_summary(results: list[dict[str, Any]]) -> dict[str, Any]:
    long_case = next((result for result in results if result["case"] == LONG_CASE_NAME), None)
    if long_case is None:
        return {"caseCount": len(results), "longCase": None}

    cpu_long = long_case["cpuSameWorker"]
    gpu_long = long_case["gpuSameWorker"]
    return {
        "caseCount": len(results),
        "longCase": {
            "cpuWallMs": cpu_long["wallMs"],
            "gpuEncodeMs": gpu_long["encodeMs"],
            "gpuRenderMs": gpu_long["renderMs"],
            "gpuVramPeakUsedMiB": gpu_long["gpuVramPeakUsedMiB"],
            "gpuWallMs": gpu_long["wallMs"],
            "name": LONG_CASE_NAME,
        },
    }


def _collect_runtime_info() -> dict[str, Any]:
    ffmpeg_encoders = _run_command(["ffmpeg", "-hide_banner", "-encoders"])
    gpu_info = _run_command(
        [
            "nvidia-smi",
            "--query-gpu=name,driver_version,memory.total",
            "--format=csv,noheader,nounits",
        ]
    )
    uname = _run_command(["uname", "-sm"])
    nvidia_vk_manifest = _detect_nvidia_vulkan_driver_manifest()
    nvidia_vk_library_entries = _discover_dynamic_library_entries(NVIDIA_VULKAN_LIBRARY_NAME)
    nvidia_vk_library_loadable, nvidia_vk_library_error = _probe_dynamic_library_load(
        NVIDIA_VULKAN_LIBRARY_NAME
    )
    if not ENGINE_BINARY_PATH.exists():
        raise RuntimeError(f"missing engine binary at {ENGINE_BINARY_PATH}")
    if gpu_info.returncode != 0:
        raise RuntimeError(
            "nvidia-smi failed; GPU runtime is unavailable:\n"
            f"{gpu_info.stderr.strip()}"
        )
    if "h264_nvenc" not in ffmpeg_encoders.stdout:
        raise RuntimeError("ffmpeg does not expose h264_nvenc in this container")
    if nvidia_vk_manifest is None:
        raise RuntimeError(
            "missing NVIDIA Vulkan ICD manifest; visible manifests:\n"
            f"{chr(10).join(_discover_vulkan_driver_manifests())}"
        )
    if not nvidia_vk_library_loadable:
        entries = "\n".join(nvidia_vk_library_entries) or "(no ldconfig entries found)"
        raise RuntimeError(
            f"{NVIDIA_VULKAN_LIBRARY_NAME} is not loadable inside the container.\n"
            f"ldconfig entries:\n{entries}\n"
            f"probe error:\n{nvidia_vk_library_error or '(no stderr)'}"
        )
    return {
        "cpu": WORKER_CPU,
        "engineBinaryExists": True,
        "ffmpegHasNvenc": True,
        "ffmpegEncodersExcerpt": [
            line
            for line in ffmpeg_encoders.stdout.splitlines()
            if "264" in line or "nvenc" in line
        ],
        "gpuInfo": gpu_info.stdout.strip().splitlines(),
        "memoryMiB": WORKER_MEMORY_MIB,
        "nvidiaDriverCapabilities": os.environ.get("NVIDIA_DRIVER_CAPABILITIES"),
        "nvidiaVkLibraryEntries": nvidia_vk_library_entries,
        "nvidiaVkLibraryLoadable": nvidia_vk_library_loadable,
        "nvidiaVkLibraryName": NVIDIA_VULKAN_LIBRARY_NAME,
        "nvidiaVkLibraryProbeError": nvidia_vk_library_error or None,
        "platform": uname.stdout.strip(),
        "nvidiaVkDriverManifest": nvidia_vk_manifest,
        "requireNvidiaVulkan": True,
        "vkDriverFiles": os.environ.get("VK_DRIVER_FILES"),
        "vkIcdFilenames": os.environ.get("VK_ICD_FILENAMES"),
        "vulkanDriverManifests": _discover_vulkan_driver_manifests(),
    }


@app.function(
    gpu=GPU_TYPE,
    image=engine_image,
    timeout=60 * 30,
    cpu=WORKER_CPU,
    memory=WORKER_MEMORY_MIB,
)
def runtime_preflight() -> dict[str, Any]:
    return _collect_runtime_info()


@app.cls(
    gpu=GPU_TYPE,
    image=engine_image,
    timeout=60 * 30,
    cpu=WORKER_CPU,
    memory=WORKER_MEMORY_MIB,
)
class BenchWorker:
    @modal.method()
    def runtime_info(self) -> dict[str, Any]:
        runtime = _collect_runtime_info()
        _log_modal_event("runtime", runtime)
        return runtime

    @modal.method()
    def run_case(
        self,
        name: str,
        case_json: str,
        backend: str,
        parallel_workers: int = 1,
        codec: str = PERF_CODEC,
    ) -> dict[str, Any]:
        temp_dir = Path(tempfile.mkdtemp(prefix=f"motion-modal-{name}-{backend}-"))
        input_path = temp_dir / "input.json"
        output_path = temp_dir / f"{backend}.mp4"
        input_path.write_text(case_json, encoding="utf8")

        args = [
            "/usr/bin/time",
            "-v",
            str(ENGINE_BINARY_PATH),
            str(input_path),
            str(output_path),
            codec,
            f"--backend={backend}",
        ]
        if parallel_workers > 1:
            args.append(f"--parallel-workers={parallel_workers}")

        gpu_samples: list[tuple[int, int]] = []
        stop_event = threading.Event()
        watcher: threading.Thread | None = None
        if backend == "gpu":
            poll_interval_seconds = (
                GPU_POLL_INTERVAL_SECONDS if name == LONG_CASE_NAME else 1.0
            )
            watcher = threading.Thread(
                target=_watch_gpu_memory,
                args=(stop_event, gpu_samples, poll_interval_seconds),
                daemon=True,
            )
            watcher.start()

        started = time.perf_counter()
        try:
            result = _run_command(args)
        finally:
            if watcher is not None:
                stop_event.set()
                watcher.join(timeout=2)
        wall_ms = round((time.perf_counter() - started) * 1000, 2)

        stderr = result.stderr
        if result.returncode != 0:
            raise RuntimeError(f"benchmark case {name} failed:\n{stderr}")

        render_ms, encode_ms, max_rss_kb, backend_label = _parse_engine_metrics(stderr)
        gpu_vram_peak_used_mib = max((used for used, _ in gpu_samples), default=None)
        gpu_vram_total_mib = gpu_samples[-1][1] if gpu_samples else None

        metrics = {
            "backend": backend,
            "backendLabel": backend_label,
            "case": name,
            "codec": codec,
            "comparisonScope": "same-worker-backend-isolation",
            "encodeMs": round(encode_ms, 2),
            "gpuVramPeakUsedMiB": gpu_vram_peak_used_mib,
            "gpuVramTotalMiB": gpu_vram_total_mib,
            "maxRssKb": max_rss_kb,
            "parallelWorkers": parallel_workers,
            "renderMs": round(render_ms, 2),
            "resourceShape": {
                "cpu": WORKER_CPU,
                "memoryMiB": WORKER_MEMORY_MIB,
            },
            "stderrTail": "\n".join(stderr.strip().splitlines()[-6:]),
            "wallMs": wall_ms,
        }

        _log_modal_event("bench_case", metrics)
        shutil.rmtree(temp_dir, ignore_errors=True)
        return metrics

    @modal.method()
    def run_pixel_verify(self, name: str, case_json: str) -> dict[str, Any]:
        case = CASES_BY_NAME[name]
        verify_case = _make_verify_case(json.loads(case_json))
        temp_dir = Path(tempfile.mkdtemp(prefix=f"motion-modal-verify-{name}-"))

        cpu_input = temp_dir / "cpu.json"
        gpu_input = temp_dir / "gpu.json"
        cpu_output = temp_dir / "cpu.mp4"
        gpu_output = temp_dir / "gpu.mp4"

        # We intentionally clamp verification to a single frame because the metric
        # extracts only the first frame; this preserves the comparison while keeping
        # correctness checks cheap enough to run alongside the perf suite.
        _write_json(cpu_input, verify_case)
        _write_json(gpu_input, verify_case)

        cpu_result = _run_command(
            [
                str(ENGINE_BINARY_PATH),
                str(cpu_input),
                str(cpu_output),
                VERIFY_CODEC,
                "--backend=cpu",
            ]
        )
        if cpu_result.returncode != 0:
            raise RuntimeError(f"pixel verify cpu render failed for {name}:\n{cpu_result.stderr}")

        gpu_result = _run_command(
            [
                str(ENGINE_BINARY_PATH),
                str(gpu_input),
                str(gpu_output),
                VERIFY_CODEC,
                "--backend=gpu",
            ]
        )
        if gpu_result.returncode != 0:
            raise RuntimeError(f"pixel verify gpu render failed for {name}:\n{gpu_result.stderr}")

        cpu_frame = _extract_first_frame(cpu_output)
        gpu_frame = _extract_first_frame(gpu_output)
        diff = _compute_pixel_diff(cpu_frame, gpu_frame)
        shutil.rmtree(temp_dir, ignore_errors=True)

        verify_result = {
            "avgChannelDiff": diff["avgChannelDiff"],
            "changedPixelRatio": diff["changedPixelRatio"],
            "pass": (
                diff["avgChannelDiff"] <= case.threshold.max_avg_channel_diff
                and diff["changedPixelRatio"] <= case.threshold.max_changed_pixel_ratio
            ),
            "threshold": {
                "maxAvgChannelDiff": case.threshold.max_avg_channel_diff,
                "maxChangedPixelRatio": case.threshold.max_changed_pixel_ratio,
            },
            "verifyCodec": VERIFY_CODEC,
        }
        _log_modal_event("pixel_verify", {"case": name, **verify_result})
        return verify_result


def _run_benchmark_suite_impl() -> dict[str, Any]:
    worker = BenchWorker()
    runtime = worker.runtime_info.remote()

    results: list[dict[str, Any]] = []
    for case in CASES:
        case_json = json.dumps(case.description)
        workers = LONG_CASE_PARALLEL_WORKERS if case.name == LONG_CASE_NAME else 1
        cpu_same_worker = worker.run_case.remote(case.name, case_json, "cpu")
        gpu_same_worker = worker.run_case.remote(case.name, case_json, "gpu", workers)
        pixel_diff = worker.run_pixel_verify.remote(case.name, case_json)

        results.append(
            {
                "case": case.name,
                "cpuSameWorker": cpu_same_worker,
                "gpuSameWorker": gpu_same_worker,
                "pixelDiff": pixel_diff,
            }
        )

    payload = {
        "results": results,
        "runtime": runtime,
        "summary": _build_suite_summary(results),
    }
    _log_modal_event("bench_suite_summary", payload["summary"])
    return payload


@app.function(image=base_image, timeout=60 * 30)
def run_benchmark_suite() -> dict[str, Any]:
    return _run_benchmark_suite_impl()


@app.function(image=base_image, timeout=60 * 30)
@modal.fastapi_endpoint(method="POST", docs=True)
def run_benchmark_suite_endpoint() -> dict[str, Any]:
    return _run_benchmark_suite_impl()


def _print_table(results: list[dict[str, Any]]) -> None:
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
        case_name = result["case"]
        cpu = result["cpuSameWorker"]
        gpu = result["gpuSameWorker"]
        pixel_diff = result["pixelDiff"]

        rows = [
            ("wall_ms", cpu["wallMs"], gpu["wallMs"], _speedup_string(cpu["wallMs"], gpu["wallMs"])),
            (
                "render_ms",
                cpu["renderMs"],
                gpu["renderMs"],
                _speedup_string(cpu["renderMs"], gpu["renderMs"]),
            ),
            (
                "encode_ms",
                cpu["encodeMs"],
                gpu["encodeMs"],
                _speedup_string(cpu["encodeMs"], gpu["encodeMs"]),
            ),
            ("gpu_vram_mib", None, None, _format_vram(gpu)),
            ("pixel_diff_pass", None, None, "PASS" if pixel_diff["pass"] else "FAIL"),
        ]

        for index, (metric, cpu_value, gpu_value, extra) in enumerate(rows):
            left_case = case_name if index == 0 else ""
            cpu_str = _format_float(cpu_value)
            gpu_str = _format_float(gpu_value)
            if metric == "gpu_vram_mib":
                gpu_str = _format_vram(gpu)
            elif metric == "pixel_diff_pass":
                gpu_str = (
                    f"{pixel_diff['avgChannelDiff']:.4f}/{pixel_diff['changedPixelRatio']:.4f}"
                )
            print(
                left_case.ljust(14),
                metric.ljust(20),
                cpu_str.rjust(16),
                gpu_str.rjust(16),
                extra.rjust(10),
            )


@app.local_entrypoint()
def main(mode: str = "bench") -> None:
    if mode == "preflight":
        print(json.dumps({"runtime": runtime_preflight.remote()}, indent=2))
        return

    if mode == "bench-deployed":
        deployed = modal.Function.from_name(APP_NAME, DEPLOYED_SUITE_FUNCTION_NAME)
        payload = deployed.remote()
        print(json.dumps(payload, indent=2))
        _print_table(payload["results"])
        return

    if mode != "bench":
        raise RuntimeError(
            f"unsupported mode '{mode}', expected 'bench', 'bench-deployed', or 'preflight'"
        )

    print(
        "Note: `bench` runs the local app definition and may rebuild changed image layers. "
        "Use `bench-deployed` after `modal deploy` to invoke the deployed benchmark without rebuilding."
    )
    payload = _run_benchmark_suite_impl()
    print(json.dumps(payload, indent=2))
    _print_table(payload["results"])
