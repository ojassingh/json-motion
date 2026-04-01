from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import modal

ROOT_DIR = Path(__file__).resolve().parents[1]
ENGINE_LOCAL_DIR = ROOT_DIR / "engine"
ENGINE_REMOTE_DIR = Path("/engine")
ENGINE_BINARY_PATH = ENGINE_REMOTE_DIR / "target" / "release" / "engine"

APP_NAME = "motion-modal-render"
GPU_TYPE = "L40S"
WORKER_CPU = (4.0, 4.0)
WORKER_MEMORY_MIB = (16_384, 16_384)
DEFAULT_CODEC = "h264_nvenc"
DEFAULT_BACKEND = "gpu"
NVIDIA_VULKAN_MANIFEST_PATH = Path("/etc/vulkan/icd.d/nvidia_icd.json")
NVIDIA_DRIVER_CAPABILITIES_VALUE = "all"
TIMINGS_RE = re.compile(r"timings:\s+render=([0-9.]+)ms,\s+encode=([0-9.]+)ms")
R2_ENV_NAMES = (
    "R2_ACCESS_KEY_ID",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_BASE_URL",
    "R2_S3_ENDPOINT",
    "R2_SECRET_ACCESS_KEY",
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

REQUIRE_NVIDIA_VULKAN_ENV = {
    "ENGINE_REQUIRE_NVIDIA_VULKAN": "1",
    "NVIDIA_DRIVER_CAPABILITIES": NVIDIA_DRIVER_CAPABILITIES_VALUE,
    "VK_DRIVER_FILES": str(NVIDIA_VULKAN_MANIFEST_PATH),
    "VK_ICD_FILENAMES": str(NVIDIA_VULKAN_MANIFEST_PATH),
}


def _read_dotenv(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}

    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", maxsplit=1)
        values[key.strip()] = value.strip()
    return values


def _resolve_secret_values() -> dict[str, str]:
    env_values = _read_dotenv(ROOT_DIR / ".env.local")
    resolved: dict[str, str] = {}
    for name in R2_ENV_NAMES:
        value = os.environ.get(name, env_values.get(name, "")).strip()
        if value:
            resolved[name] = value
    return resolved


r2_secret = modal.Secret.from_dict(_resolve_secret_values())

app = modal.App(APP_NAME)
image = (
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
        "ffmpeg",
        "git",
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
    .pip_install("boto3", "fastapi[standard]")
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
    .add_local_dir(str(ENGINE_LOCAL_DIR), "/engine", copy=True)
    .run_commands("cd /engine && cargo build --release --features gpu")
)


def _require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    raise RuntimeError(f"{name} is not configured.")


def _require_string(payload: dict[str, Any], key: str, fallback: str | None = None) -> str:
    value = payload.get(key, fallback)
    if isinstance(value, str) and value.strip():
        return value.strip()
    raise ValueError(f"{key} must be a non-empty string.")


def _require_scene(payload: dict[str, Any]) -> dict[str, Any]:
    scene = payload.get("scene")
    if isinstance(scene, dict):
        return scene
    raise ValueError("scene must be a JSON object.")


def _scene_contains_node_type(scene: dict[str, Any], node_type: str) -> bool:
    scenes = scene.get("scenes")
    if not isinstance(scenes, list):
        return False

    for scene_entry in scenes:
        if not isinstance(scene_entry, dict):
            continue
        nodes = scene_entry.get("nodes")
        if not isinstance(nodes, dict):
            continue
        for node in nodes.values():
            if isinstance(node, dict) and node.get("type") == node_type:
                return True

    return False


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload), encoding="utf8")


def _run_command(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf8",
    )


def _parse_engine_timings(stderr: str) -> tuple[float, float]:
    timings_match = TIMINGS_RE.search(stderr)
    if timings_match is None:
        raise RuntimeError(f"engine did not emit timing output:\n{stderr}")
    return (float(timings_match.group(1)), float(timings_match.group(2)))


def _create_r2_client():
    import boto3
    from botocore.config import Config

    return boto3.client(
        "s3",
        aws_access_key_id=_require_env("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=_require_env("R2_SECRET_ACCESS_KEY"),
        config=Config(signature_version="s3v4"),
        endpoint_url=_require_env("R2_S3_ENDPOINT"),
        region_name="auto",
    )


def _build_public_url(object_key: str) -> str:
    public_base_url = _require_env("R2_PUBLIC_BASE_URL").rstrip("/")
    normalized_key = object_key.lstrip("/")
    return f"{public_base_url}/{normalized_key}"


def _upload_video_to_r2(video_path: Path, object_key: str) -> None:
    client = _create_r2_client()
    client.upload_file(
        str(video_path),
        _require_env("R2_BUCKET_NAME"),
        object_key,
        ExtraArgs={"ContentType": "video/mp4"},
    )


@app.function(
    gpu=GPU_TYPE,
    image=image,
    timeout=60 * 30,
    cpu=WORKER_CPU,
    memory=WORKER_MEMORY_MIB,
    secrets=[r2_secret],
)
@modal.fastapi_endpoint(method="POST", docs=True)
def render_video(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        job_id = _require_string(payload, "jobId")
        object_key = _require_string(payload, "objectKey")
        scene = _require_scene(payload)
        codec = _require_string(payload, "codec", DEFAULT_CODEC)
    except ValueError as error:
        raise RuntimeError(str(error)) from error

    temp_dir = Path(tempfile.mkdtemp(prefix=f"motion-render-{job_id}-"))
    input_path = temp_dir / "input.json"
    output_path = temp_dir / "output.mp4"
    backend = os.environ.get("MODAL_RENDER_BACKEND", DEFAULT_BACKEND).strip() or DEFAULT_BACKEND
    if backend == "gpu" and _scene_contains_node_type(scene, "arrow"):
        backend = "cpu"

    try:
        _write_json(input_path, scene)
        result = _run_command(
            [
                str(ENGINE_BINARY_PATH),
                str(input_path),
                str(output_path),
                codec,
                f"--backend={backend}",
            ]
        )
        if result.returncode != 0:
            raise RuntimeError(
                "\n".join(
                    [
                        line.strip()
                        for line in result.stderr.splitlines()
                        if line.strip()
                    ][-8:]
                )
            )

        render_ms, encode_ms = _parse_engine_timings(result.stderr)
        _upload_video_to_r2(output_path, object_key)

        return {
            "codec": codec,
            "filePath": object_key,
            "jobId": job_id,
            "publicUrl": _build_public_url(object_key),
            "timings": {
                "encodeMs": round(encode_ms, 2),
                "renderMs": round(render_ms, 2),
            },
        }
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
