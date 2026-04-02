- [x] Restructure the GPU export path so rendering and encoding overlap instead of serializing on one thread.
- [x] Replace multi-GPU-worker export with a single-GPU producer and CPU encode workers only when it improves wall time.
- [x] Add only the fast paths that clearly paid off: static-scene frame reuse, a small-clip inline GPU path, and single-init GPU startup.
- [x] Consolidate benchmark entrypoints into a single benchmark directory and extend the harness with case filtering for targeted reruns.
- [x] Run release benchmarks plus targeted correctness checks, document results, create many small conventional commits, push the branch, and open a PR.

---

- [x] Extend the GPU path pipeline so the explicit GPU export lane can draw `arrow`, `circle`, `line`, `functionGraph`, and `parametricGraph` nodes instead of dropping them.
- [x] Remove the Modal arrow-only CPU escape hatch once the GPU export lane supports the missing vector primitives.
- [x] Add focused GPU regression tests that compare mixed unsupported-primitives scenes against CPU output and verify circle/graph content is present.

---

## GPU Export Overlap Pass

### Plan

- Build the fastest lean pipeline first: one GPU render lane, bounded buffering, and parallel CPU encode only where it reduces wall time without GPU contention.
- Keep the public render contract stable unless a narrower internal seam materially improves throughput.
- Use benchmarks to decide which fast paths stay; avoid redundant caches or abstractions that do not move wall time.

### Review

- Replaced the old “GPU render plus serial encode on one thread” route with a lean split: one `WgpuBackend` renders frames, bounded CPU encode workers consume completed RGBA frames, and chunk files are still remuxed with stream copy at the end.
- Kept the architecture narrow by removing the obsolete single-thread GPU export branch, but reintroduced one explicit inline fast path for short clips (`<= 240` frames) because benchmarks showed worker orchestration overhead was not worth it there.
- Added one scene-level reuse hint from the animation compiler so timeline-free scenes can replay a cached first GPU frame instead of rerendering identical content thousands of times.
- Removed the extra `wgpu` initialization pass from the GPU entry path so short clips do not pay the backend startup cost twice.
- Centralized benchmark entrypoints under `benchmarks/` and added `BENCH_CASE_FILTER` so long-path tuning can rerun only the cases that matter.

### Verification

- `cargo test --release --features gpu` in `engine/`
- `cargo clippy --release --features gpu --all-targets -- -D warnings` in `engine/`
- `python3 -m py_compile benchmarks/modal_gpu_verify.py benchmarks/modal_gpu_bench_client.py`
- `BENCH_ITERATIONS=1 BENCH_PARALLEL_WORKERS=1 BENCH_CASE_FILTER=rect-stress,text-heavy,icon-dense,math-complex bun scripts/benchmark-engine.ts`
- `BENCH_ITERATIONS=1 BENCH_PARALLEL_WORKERS=1 BENCH_CASE_FILTER=mixed-static-long,rect-animate-long,long-form bun scripts/benchmark-engine.ts`
- `BENCH_ITERATIONS=1 BENCH_PARALLEL_WORKERS=4 BENCH_CASE_FILTER=mixed-static-long,rect-animate-long,long-form bun scripts/benchmark-engine.ts`
- `BENCH_ITERATIONS=1 BENCH_PARALLEL_WORKERS=1 bun run bench:engine` with targeted case filters for entrypoint sanity checks

### Result

- Final single-worker GPU long-form numbers on the finished branch:
- `mixed-static-long`: GPU wall `18372.99ms` vs CPU wall `32570.81ms` (`1.77x` faster)
- `rect-animate-long`: GPU wall `19800.93ms` vs CPU wall `47519.58ms` (`2.40x` faster)
- `long-form`: GPU wall `18503.75ms` vs CPU wall `35027.21ms` (`1.89x` faster)
- Compared with the pre-change GPU baseline from `main`, the default one-worker GPU path materially improved:
- `mixed-static-long`: `21939.23ms` -> `18372.99ms` (`-16.3%`)
- `rect-animate-long`: `31589.65ms` -> `19800.93ms` (`-37.3%`)
- `long-form`: `39351.52ms` -> `18503.75ms` (`-53.0%`)
- Final short/medium spot checks on the finished branch:
- `text-heavy`: GPU wall `525.50ms` vs CPU wall `546.93ms`
- `icon-dense`: GPU wall `519.13ms` vs CPU wall `672.58ms`
- `math-complex`: GPU wall `665.48ms` vs CPU wall `1169.36ms`
- `rect-stress` remains a known outlier where the GPU path is still not the fastest locally (`987.71ms` GPU vs `811.72ms` CPU), and its GPU pixel-diff threshold was already failing before this pass.

### Modal Follow-up

- Deployed the current branch to Modal and ran the deployed `run_benchmark_suite` on an `L40S` worker with `4 CPU / 16 GiB`, `h264_nvenc`, and strict NVIDIA Vulkan enforcement.
- Remote same-worker CPU vs GPU wall times came back as:
- `mixed-static-long`: CPU `21443.29ms` vs GPU `9922.39ms` (`2.16x` faster)
- `rect-animate-long`: CPU `24439.65ms` vs GPU `11998.73ms` (`2.04x` faster)
- `long-60s`: CPU `25217.05ms` vs GPU `10502.61ms` (`2.40x` faster)
- Modal also confirmed the expected runtime lane: `NVIDIA L40S`, NVENC available, and only `/etc/vulkan/icd.d/nvidia_icd.json` visible.

---

- [x] Review the current worktree and split it into the smallest coherent commits.
- [x] Stage and commit each change set with conventional commit notation.
- [x] Run targeted verification after the commit split and push the branch.

---

## Commit Push Workflow

### Review

- Split the dirty worktree into four focused conventional commits instead of one catch-all snapshot.
- Isolated repo hygiene from engine behavior, local benchmark inputs, and Modal harness changes so each commit can be reviewed or reverted independently.
- Left the task log and lessons as a final docs-only commit so the workflow record matches the actual commit sequence and verification state.

### Verification

- `cargo test --release --features gpu` in `engine/`
- `cargo clippy --release --features gpu --all-targets -- -D warnings` in `engine/`
- `python3 -m py_compile scripts/modal_gpu_verify.py scripts/modal_gpu_bench_client.py`

### Result

- The branch is now split into small reviewable commits and the verified code is ready to push.

---

- [x] Remove `mesa-vulkan-drivers` from the Modal image and rerun the strict Vulkan preflight.
- [x] Run one tiny Modal GPU case against the Mesa-free image to see whether NVIDIA Vulkan becomes visible.

---

## Modal NVIDIA Vulkan Container Fix

### Review

- Updated the Modal GPU image in `scripts/modal_gpu_verify.py` to request `NVIDIA_DRIVER_CAPABILITIES=all`, install `libxext6`, write an explicit `/etc/vulkan/icd.d/nvidia_icd.json`, remove the Mesa Vulkan ICD manifests, and pin both `VK_DRIVER_FILES` and `VK_ICD_FILENAMES` to the NVIDIA manifest.
- Switched the manifest to `libEGL_nvidia.so.0` rather than `libGLX_nvidia.so.0` so the Vulkan ICD targets NVIDIA’s headless EGL-backed path inside Modal’s container runtime.
- Extended runtime preflight so it now proves the NVIDIA Vulkan shared library is present and loadable, and reports the active Vulkan driver file env plus the visible ICD manifests.
- Kept the Rust-side strict adapter requirement unchanged: the engine still fails closed unless `wgpu` finds an actual NVIDIA Vulkan adapter.

### Verification

- `python3 -m py_compile scripts/modal_gpu_verify.py`
- `modal run scripts/modal_gpu_verify.py --mode preflight`
- Targeted Modal GPU case via `BenchWorker.run_case("text-heavy", ..., "gpu")`

### Results

- Modal preflight now reports exactly one visible Vulkan manifest: `/etc/vulkan/icd.d/nvidia_icd.json`.
- Modal preflight now reports the NVIDIA Vulkan library as loadable: `libEGL_nvidia.so.0 => /usr/lib/x86_64-linux-gnu/libEGL_nvidia.so.0`.
- The targeted explicit GPU case now succeeds instead of failing adapter discovery:
- `backendLabel: gpu:wgpu`
- `renderMs: 54.3`
- `encodeMs: 294.34`
- `wallMs: 1638.49`
- `gpuVramPeakUsedMiB: 730`

### Conclusion

- Modal is no longer silently benchmarking Mesa/llvmpipe for the GPU render lane. The container now exposes a real NVIDIA Vulkan adapter to `wgpu`, and the strict engine check passes on a real GPU render invocation.

---

- [x] Force the Modal GPU lane onto the Vulkan backend and documented `wgpu` adapter selection path.
- [x] Fail fast when the selected `wgpu` adapter is not the expected NVIDIA/Vulkan device, and log the chosen adapter.
- [x] Propagate strict Vulkan/NVIDIA env settings through the Modal benchmark harness and surface them in runtime preflight.
- [x] Run targeted Rust verification plus a Modal preflight check and document the result.

---

- [x] Split Modal benchmark image into stable base and engine-build layers.
- [x] Add a deployed benchmark entrypoint that runs the suite inside Modal without `modal run`.
- [x] Add a tiny local client for invoking the deployed benchmark and printing results without rebuilding.
- [ ] Verify linting and basic invocation flow; document the new usage in the review notes.

---

- [x] Fix explicit GPU backend requests so they fail closed instead of silently falling back to CPU.
- [x] Change parallel chunk merging to remux with stream copy instead of re-encoding chunk outputs.
- [x] Replace summed worker timings with wall-clock timing buckets for parallel export and include merge time.
- [x] Re-run engine verification and targeted runtime smoke checks.

- [x] Review the Modal GPU slowdown against the current Rust export architecture.
- [x] Inspect the GPU backend render path for per-frame CPU work, synchronization, and upload/readback costs.
- [x] Decide whether the slow path is architectural or implementation-specific and document the fix direction.
- [x] Implement pipelined GPU readback so render, readback, and encode can overlap.
- [x] Compile and reuse static GPU draw batches while rebuilding only dynamic nodes per frame.
- [x] Extend the existing benchmark harnesses with `mixed-static-long` and `rect-animate-long`.
- [x] Run targeted engine tests, release build, and before/after benchmarks; document the results and whether the current architecture still clears the decision gate.

---

## Modal GPU Export Implementation Pass

## Modal Adapter Enforcement Simplification

### Review

- Removed the generalized environment-driven adapter policy code from the Rust backend and replaced it with one project-specific invariant: when `ENGINE_REQUIRE_NVIDIA_VULKAN=1` is set on Linux, the GPU backend creates a Vulkan-only instance, enumerates Vulkan adapters, and selects the first NVIDIA adapter or fails.
- Kept the adapter log line so every GPU startup still prints the exact adapter that `wgpu` chose.
- Simplified the Modal harness to set only `ENGINE_REQUIRE_NVIDIA_VULKAN=1` on the image instead of threading a wider set of backend-selection environment variables through every engine subprocess.
- Kept the Modal preflight reporting the visible Vulkan driver manifests because that remains the shortest explanation for why the strict GPU lane fails in the container.

### Verification

- `cargo test --release --features gpu gpu_backend_should_roughly_match_cpu_for_mixed_frame -- --nocapture` in `engine/`
- `cargo clippy --release --features gpu --all-targets -- -D warnings` in `engine/`
- `python3 -m py_compile scripts/modal_gpu_verify.py`
- `modal run scripts/modal_gpu_verify.py --mode preflight`
- Targeted Modal GPU case via `BenchWorker.run_case("text-heavy", ..., "gpu")`

### Results

- Local GPU test still passes and logs the adapter normally on macOS.
- Modal preflight still reports no NVIDIA Vulkan manifest inside the container. The visible manifests remain Mesa-only:
- `/usr/share/vulkan/icd.d/intel_hasvk_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/intel_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/lvp_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/radeon_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/virtio_icd.x86_64.json`
- The targeted Modal GPU case now fails immediately with the leaner error:
- `GPU backend requested explicitly but initialization failed: no NVIDIA Vulkan adapter available; visible adapters: name="llvmpipe (LLVM 15.0.7, 256 bits)", backend=Vulkan, vendor=0x10005, device=0x0000, type=Cpu, driver="llvmpipe", driver_info="Mesa 23.2.1-1ubuntu3.1~22.04.3 (LLVM 15.0.7)", pci_bus=""`

### Conclusion

- The simpler implementation proves the same root cause as before without the extra configuration layer: Modal’s container runtime still exposes only a software Vulkan adapter to `wgpu`, so the engine correctly refuses to benchmark it as a real GPU render path.

## Modal Adapter Selection Enforcement

### Review

- Switched the Rust `wgpu` backend initialization to use an environment-aware `InstanceDescriptor`, default Linux instances to `Backends::VULKAN`, and honor the documented `WGPU_ADAPTER_NAME` selection path instead of creating an unrestricted `Backends::all()` instance.
- Added strict GPU adapter validation gated by environment variables so the engine now logs the chosen adapter and fails closed when the selected backend, vendor, or adapter name do not match the expected Modal NVIDIA Vulkan lane.
- Updated the Modal benchmark image and engine subprocess environment to set `WGPU_BACKEND=vulkan`, `WGPU_ADAPTER_NAME=nvidia`, `ENGINE_STRICT_GPU=1`, `ENGINE_REQUIRE_GPU_BACKEND=vulkan`, `ENGINE_REQUIRE_GPU_VENDOR=0x10de`, and `ENGINE_REQUIRE_GPU_ADAPTER_SUBSTRING=nvidia`.
- Extended runtime preflight to report the active `wgpu` env settings plus the Vulkan driver manifests visible inside the Modal container so bad driver discovery is visible without reading raw container logs.

### Verification

- `cargo test --release --features gpu gpu_backend_should_roughly_match_cpu_for_mixed_frame -- --nocapture` in `engine/`
- `cargo build --release --features gpu` in `engine/`
- `cargo clippy --release --features gpu --all-targets -- -D warnings` in `engine/`
- `python3 -m py_compile scripts/modal_gpu_verify.py`
- `modal run scripts/modal_gpu_verify.py --mode preflight`
- Targeted Modal GPU case via `BenchWorker.run_case("text-heavy", ..., "gpu")`

### Results

- Local GPU test still initializes correctly and now logs the selected adapter; on macOS it reported `name="Apple M2 Pro", backend=Metal`.
- Modal preflight reported that the container sees only Mesa Vulkan manifests:
- `/usr/share/vulkan/icd.d/intel_hasvk_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/intel_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/lvp_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/radeon_icd.x86_64.json`
- `/usr/share/vulkan/icd.d/virtio_icd.x86_64.json`
- Modal preflight found **no NVIDIA Vulkan manifest** and therefore could not set `VK_DRIVER_FILES`/`VK_ICD_FILENAMES` to an NVIDIA ICD.
- The targeted strict GPU run now fails fast with: `no suitable GPU adapter matched WGPU_ADAPTER_NAME="nvidia"; visible adapters: llvmpipe (LLVM 15.0.7, 256 bits)`.

### Conclusion

- The previous “GPU” Modal benchmarks were not measuring the intended NVIDIA Vulkan render path. NVENC was available, but the `wgpu` raster backend inside the container was enumerating only a software Vulkan adapter (`llvmpipe`) because the container’s Vulkan driver manifests did not include an NVIDIA ICD.
- The codebase now enforces and exposes the correct selection logic, but the remaining blocker is image/runtime configuration on Modal: the container must be given access to the NVIDIA Vulkan ICD manifest/library path before the strict GPU lane can succeed.

### Review

- Added a dedicated pipelined GPU encode path that lets `WgpuBackend` submit multiple frames into a rotating readback queue and then drain the oldest completed frame later, instead of forcing a blocking GPU readback immediately after each render.
- Kept the CPU export path and public CLI unchanged; the new pipelined logic is used only for explicit GPU exports.
- Added scene-local static batch metadata during compile/resolve so resolved nodes are marked `Static` or `Dynamic`, then cached static rect/text/path GPU resources per scene while rebuilding only the dynamic subset each frame.
- Extended the existing benchmark harnesses with `mixed-static-long` and `rect-animate-long` to separate static-scene wins from dynamic upload costs without creating a new harness.
- Added a focused regression test to ensure absolute nodes without animated render properties stay marked `Static` while animated nodes are marked `Dynamic`.

### Verification

- `cargo test --release --features gpu` in `engine/`
- `cargo clippy --release --features gpu --all-targets -- -D warnings` in `engine/`
- `cargo build --release --features gpu` in `engine/`
- `BENCH_ITERATIONS=1 bun run bench:engine`
- `BENCH_ITERATIONS=1 BENCH_PARALLEL_WORKERS=3 bun run bench:engine`

### Benchmarks

- Local single-worker GPU (`BENCH_PARALLEL_WORKERS=1`) improved materially on the primary cases:
- `mixed-dense`: GPU wall `1352.60ms` vs CPU wall `1927.16ms`
- `mixed-static-long`: GPU render `1791.09ms` vs CPU render `13189.47ms`; GPU wall `18312.54ms` vs CPU wall `30665.80ms`
- `rect-animate-long`: GPU render `7995.31ms` vs CPU render `17614.24ms`; GPU wall `25349.09ms` vs CPU wall `35366.19ms`
- `long-form`: GPU render `6395.39ms` vs CPU render `21199.11ms`; GPU wall `23723.81ms` vs CPU wall `41360.21ms`

- Local three-worker GPU (`BENCH_PARALLEL_WORKERS=3`) did not clear the desired gate:
- `mixed-dense`: GPU wall `1406.68ms` vs CPU wall `1997.76ms`, but GPU render bucket rose to `1194.23ms`
- `mixed-static-long`: GPU wall `19657.75ms`, render `19385.56ms`
- `rect-animate-long`: GPU wall `18995.55ms`, render `18742.62ms`
- `long-form`: GPU wall `19659.00ms`, render `19327.77ms`

### Gate Decision

- Phases 1 and 2 produced real wins and proved the static batch architecture is worthwhile.
- They did **not** get the engine close to the `<5s total` target, and the local three-worker GPU path still spends far too much time in chunk processing.
- Based on the implemented results, the current CPU-framebuffer architecture still fails the decision gate; a true GPU-native encode/export lane remains the next architectural step if the Modal target is still required.

### Notes

- Modal verification could not be rerun from this environment because the `modal` CLI and Python package are not installed here, so the gate call above is based on local release benchmarks only.

## Modal GPU Slowdown Review

### Review

- The current GPU backend is not a full GPU-native render pipeline. It accelerates only the raster pass, but frame resolution still happens on the CPU, including timeline resolution, layout fallback, resolved-node construction, text measurement/atlas work, and icon transform expansion before each frame draw.
- The most expensive structural issue is the forced GPU-to-CPU synchronization on every frame: after submitting the render pass, the backend copies the framebuffer into a staging buffer, blocks on `device.poll(wait_indefinitely)`, maps the buffer, and copies rows back into the CPU `FrameBuffer`. That means the GPU cannot run ahead and the encoder only ever receives CPU memory.
- The parallel chunk architecture is not the problem. The render bucket in `parallel_encode` covers the whole chunk-processing window, while concat/remux is a separate final step. Your `26.9s render / 0.175s concat` split matches the code and confirms the merge path is already cheap.
- The implementation also rebuilds large CPU-side draw data every frame: rect instances are recollected, transformed icon vertices are expanded into fresh vectors, text node lookups are rebuilt, and instance buffers are rewritten every frame even when scene content is mostly static.
- Text caching helps, but it is narrow. The atlas is cached only for the last text-key state, so any animated text sizing/layout invalidates it, and atlas construction itself still depends on Skia text measurement and blob creation on the CPU.
- Low VRAM usage is expected here and does not exonerate the backend. This design is dominated by CPU work, PCIe/copy traffic, and synchronization, not by large persistent GPU working sets.

### Fix Direction

- This is both an architectural mismatch and an implementation bottleneck. The architecture is acceptable for correctness and incremental acceleration, but it is the wrong shape if the KPI is “beat a strong local GPU export path on a remote L40S worker.”
- The highest-value next step is to remove per-frame blocking readback from the render loop. If the encoder must stay CPU-side, use a multi-buffered/asynchronous readback pipeline so render `N+1` can proceed while frame `N` is being mapped/copied.
- The next tier is reducing CPU frame-build work: stop cloning layout maps in `resolve_frame_fast`, avoid rebuilding transformed geometry for static nodes, and cache more than a single text-atlas state.
- If the real target is cloud-GPU superiority, the more honest long-term direction is a GPU-native video path: keep frames on-GPU longer, convert color on-GPU, and hand off to a hardware encoder without round-tripping every frame through CPU RGBA memory.

## Parallel Export Findings Fix

### Review

- Explicit `--backend=gpu` requests now fail closed if the binary was built without the `gpu` feature or if GPU backend initialization fails; only auto-selection is allowed to fall back to CPU.
- Parallel export now writes intermediate chunk files as `.mkv` and concatenates them with `ffmpeg -c copy`, so the final merge remuxes the chunk outputs instead of running a second full encode pass.
- Parallel mode now reports wall-clock timing buckets instead of summed worker timings: `render` covers the parallel chunk-processing window and `encode` covers the final concat/remux step, which keeps the existing API shape while making the total truthful again.
- Improved concat failure reporting so FFmpeg stderr is surfaced on merge failures instead of returning only an exit code.
- Cleared the outstanding Clippy warnings in the touched engine code by replacing manual ceil division and collapsing the oversized argument lists into small request structs.

### Verification

- `cargo test --release --features gpu` in `engine/`
- `cargo clippy --release --features gpu --all-targets -- -D warnings` in `engine/`
- `cargo build --release --features gpu` in `engine/`
- `cargo run --release -- <input> <output>.mp4 libx264 --backend=gpu` in `engine/`
  - verified explicit GPU requests now fail closed without the feature: `GPU backend requested explicitly but engine was built without the 'gpu' feature`
- Direct engine smoke run with `--backend=cpu --parallel-workers=3`
  - verified the parallel path completes successfully after the no-reencode concat change and emits the expected timing line
- `BENCH_ITERATIONS=1 BENCH_PARALLEL_WORKERS=3 bun run bench:engine`
  - completed the short and medium cases (`rect-stress`, `text-heavy`, `icon-dense`, `math-complex`, `mixed-dense`) without parallel concat failures; the long-form case was still running when this review note was written

### Notes

- The benchmark harness still reports one existing image-quality failure on `rect-stress` GPU pixel diff; that predates these three fixes and was not part of this patch.

- [x] Inspect GPU backend hotspots for atlas rebuilds, tessellation churn, and per-frame buffer allocation.
- [x] Capture a fresh benchmark baseline for the GPU engine cases.
- [x] Add minimal cross-frame caches for text atlas results and icon/math tessellation.
- [x] Reuse grow-only GPU buffers for rect, text, and path draws instead of recreating them every frame.
- [x] Run targeted verification plus before/after benchmarks and document the result.

---

## GPU Cache Pass

### Review

- Added a single-entry text atlas cache in `WgpuBackend` keyed by raster-affecting text inputs, while storing line placement in local text space so moving or rotating text can still reuse the same atlas across frames.
- Added a simple icon/path tessellation cache keyed by icon geometry/style, then applied transform and opacity per frame from cached local-space vertices instead of reparsing and retessellating every icon every frame.
- Replaced per-frame rect/text/path GPU upload buffer creation with grow-only reusable buffers that persist on the backend and are rewritten via `queue.write_buffer`.

### Verification

- `cargo test --release --features gpu gpu_backend_should_roughly_match_cpu_for_mixed_frame -- --nocapture` in `engine/`
- `cargo build --release --features gpu` in `engine/`
- `BENCH_ITERATIONS=1 bun run bench:engine`

### Benchmarks

- GPU render time, before -> after:
- `rect-stress`: `227.46ms` -> `226.38ms` (`-0.5%`)
- `text-heavy`: `489.71ms` -> `206.50ms` (`-57.8%`)
- `icon-dense`: `236.47ms` -> `202.71ms` (`-14.3%`)
- `math-complex`: `2965.15ms` -> `315.51ms` (`-89.4%`)
- `mixed-dense`: `1005.34ms` -> `858.21ms` (`-14.6%`)
- `long-form`: `22112.19ms` -> `16810.92ms` (`-24.0%`)

---

## GPU Quality Pass

### Review

- Added a minimal 4x MSAA render target for the GPU backend, then resolve into the existing single-sample framebuffer for readback/encoding.
- Updated the rect, text, and path pipelines to use the same sample count so icon and math edges get hardware multisample smoothing without changing the existing caching or tessellation design.

### Verification

- `cargo build --release --features gpu` in `engine/`
- `cargo test --release --features gpu gpu_backend_should_roughly_match_cpu_for_mixed_frame -- --nocapture` in `engine/`
- `BENCH_ITERATIONS=1 bun run bench:engine`

### Benchmarks

- GPU render time after MSAA vs pre-MSAA cached backend:
- `rect-stress`: `226.38ms` -> `225.24ms` (`-0.5%`)
- `text-heavy`: `206.50ms` -> `203.65ms` (`-1.4%`)
- `icon-dense`: `202.71ms` -> `214.25ms` (`+5.7%`)
- `math-complex`: `315.51ms` -> `325.06ms` (`+3.0%`)
- `mixed-dense`: `858.21ms` -> `898.22ms` (`+4.7%`)
- `long-form`: `16810.92ms` -> `19609.35ms` (`+16.7%`)

- Quality signal improved for the path-heavy cases:
- `icon-dense` pixel diff: `avgChannelDiff 1.5716 -> 0.6164`, `changedPixelRatio 0.0323 -> 0.0047`
- `math-complex` pixel diff: `avgChannelDiff 3.0783 -> 1.2664`, `changedPixelRatio 0.0682 -> 0.0230`

---

- [x] Inspect the AI generation endpoint and schema conversion path.
- [x] Inspect the render endpoint, frame renderer, and encoder pipeline.
- [x] Identify which stages are CPU-bound, GPU-assisted, or codec/hardware dependent.
- [x] Explain the post-JSON flow in plain language for a non-graphics audience.

---

## Engine Runtime Performance Layer

- [x] Compile scene timelines into reusable property tracks and frame indexes.
- [x] Reuse static layout results when scene timelines do not affect layout-critical properties.
- [x] Introduce a small render backend boundary plus reusable frame buffers for encoding.
- [x] Add benchmark coverage for simple motion, dense rects, dense animation, dense text, and dense icon fixtures.
- [x] Run before/after verification, capture benchmark results, and document review notes.

### Review

- Added a minimal runtime compile step in the Rust engine so property tracks are built once per scene instead of per node-property lookup on every frame.
- Added a small `TextMeasurer` boundary plus static-layout reuse for scenes whose timelines do not touch layout-critical properties.
- Replaced per-frame output allocation with a reusable `FrameBuffer` path and a tiny `RenderBackend` seam that still keeps the current CPU Skia renderer as the only backend.
- Added an end-to-end benchmark harness at `scripts/benchmark-engine.ts` with five fixtures: simple motion, 2,000 rects, 400 animated rects, 200 stacked text nodes, and 300 icons.

### Verification

- `cargo test` in `engine/`
- `cargo clippy --all-targets --locked -- -D warnings` in `engine/`
- `cargo build --release` in `engine/`
- `bun x tsc --noEmit`
- `BENCH_ITERATIONS=3 bun run bench:engine`

### Benchmarks

- Environment: macOS hardware encode via `h264_videotoolbox`, averaged across 3 runs per fixture.
- Baseline commit: `3dec23f`
- Current branch: `codex/runtime-eval-backend` after the runtime refactor and benchmark harness.

| Case | Before Render | After Render | Delta | Before Wall | After Wall | Delta |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `simple_motion` | 140.04ms | 134.88ms | -3.7% | 925.54ms | 735.22ms | -20.6% |
| `dense_rect_grid_2000` | 468.22ms | 339.98ms | -27.4% | 937.73ms | 806.03ms | -14.0% |
| `animated_rect_grid_400` | 685.05ms | 661.31ms | -3.5% | 1781.73ms | 1738.47ms | -2.4% |
| `layout_text_stack_200` | 190.40ms | 119.48ms | -37.2% | 705.84ms | 590.90ms | -16.3% |
| `icon_grid_300` | 283.32ms | 231.76ms | -18.2% | 791.09ms | 692.73ms | -12.4% |

- The keyframe-heavy animated grid improved only modestly. That is useful signal: the current refactor removes repeated segment construction and some allocation churn, but it does not yet add the broader evaluator caching or parallelism that will be needed for larger animation-heavy wins.

---

## Preview Panel Raw Output + Timing UI

- [x] Inspect the shared preview panel data flow for home and playground.
- [x] Add raw AI output and timing metadata to the prompt-to-video pipeline responses.
- [x] Update the preview JSON panel to toggle between scene JSON and raw AI output, with copy support.
- [x] Replace the first two video metadata cards with inference, render, and encode timings.
- [x] Run targeted verification and document the result.

### Review

- Added a shared scene/raw-output toggle to the home and playground preview panels, with copy behavior following the active view.
- Extended the prompt-to-video data flow so the client receives raw AI output plus AI inference timing, and the render response now carries render/encode timings from the Rust engine.
- Replaced the top metadata cards in the render result UI so the first visible stats are now `Inference`, `Render`, and `Encode` instead of `Job` and `Codec`.

### Verification

- `bun test app/api/render/route.test.ts`
- `bun x tsc --noEmit`
- `bun x ultracite check`
- `cargo test` in `engine/`
- `cargo build --release` in `engine/`

## Review

- Verified the request flow by reading `app/api/generate-scene/route.ts`, `lib/actions/ai.ts`, `app/api/render/route.ts`, `lib/video/render-video.ts`, `lib/video/renderer.ts`, `lib/video/pre-render.ts`, and `lib/video/encoder.ts`.
- Confirmed that frame drawing uses `skia-canvas`, per-frame scene resolution happens in application code, and final MP4 creation is delegated to `ffmpeg` with a platform-dependent codec default.

---

## Rust Render Engine

- [x] Phase 1: Serde structs mirroring Zod schemas (schema.rs)
- [x] Phase 2: CLI scaffold with JSON deserialization (main.rs, Cargo.toml)
- [x] Phase 3: Topo-sort anchor/place layout engine (layout.rs)
- [x] Phase 4: Easing + timeline interpolation (animation.rs)
- [x] Phase 5: tiny-skia rendering — rect + text nodes (render.rs)
- [x] Phase 6: H.264 encoding via ffmpeg CLI pipe (encode.rs)
- [x] Phase 7: TypeScript bridge + RENDER_ENGINE=rust feature flag (render-rust.ts)

### Verification

- Compiled and ran the Rust engine against the sample fixture (640x360, 60fps, 24 frames).
- Output: valid H.264 MP4 with correct dimensions and frame rate.
- Feature flag: set `RENDER_ENGINE=rust` in `.env.local` to use the Rust path.

---

## Render Route Test

- [x] Inspect the render route contract and current test setup.
- [x] Add a focused route test using the provided render payload.
- [x] Verify success and error handling with targeted test execution and linting.

### Review

- Added `app/api/render/route.test.ts` with focused route tests for success, malformed JSON, and propagated app-error responses.
- Verified the focused Bun test file passes: `bun test app/api/render/route.test.ts`.
- Smoke-tested the real route with the provided payload; it returned `200` and wrote an MP4 via the Rust engine to `public/renders/2e4b3c73-4a0b-44e6-a8b3-804e8e8c4263.mp4`.
- Updated `lib/video/render-rust.ts` to use Bun process/file APIs (`spawn`, `write`, `file().delete()`), then re-ran the live render smoke test successfully.

---

## Rust Pipeline Review

- [x] Inspect the Rust engine entry points, animation/layout pipeline, renderer, text handling, and encoder.
- [x] Run `cargo test` for the `engine` crate.
- [x] Run `cargo clippy --all-targets --locked -- -D warnings` for the `engine` crate.
- [x] Summarize correctness, clarity, simplicity, abstraction, reuse, and caching findings.

### Review

- The pipeline is conceptually simple at a high level: deserialize scene JSON, resolve animation state per frame, compute layout, render RGBA with Skia, then encode via FFmpeg.
- The main quality risks are silent failure paths in layout/render resolution, missing validation for invalid scene structure, schema surface area that exceeds the implemented renderer, and a “precomputed” path that still repeats substantial per-frame work.
- Verification: `cargo test` passed with 1 unit test; `cargo clippy --all-targets --locked -- -D warnings` failed on `clippy::unnecessary_map_or` in `engine/src/render.rs:37`.

### Validation Follow-up

- Added focused validation tests in `engine/src/pipeline_review_tests.rs`.
- Verified current behavior with `cargo test pipeline_review_tests -- --nocapture`:
  - Zero-duration scenes currently panic from unsigned underflow.
  - Layout resolution failures currently degrade into `(0, 0)` placement instead of returning an error.
  - `image` nodes are currently accepted by the shared schema but dropped by the Rust resolver.
- Re-ran the full crate suite with `cargo test`; all 4 tests passed.

---

## Rust Pipeline Fixes

- [x] Remove unsupported node kinds from the shared TypeScript and Rust schemas.
- [x] Make Rust layout resolution fail explicitly for invalid trees instead of silently falling back.
- [x] Reject invalid scene durations/frame ranges in the Rust engine.
- [x] Add focused regression tests for the tightened schema and Rust pipeline behavior.
- [x] Run targeted verification, create small commits, and push `refactor-rust`.

### Review

- Tightened the shared video schema to accept only node kinds the Rust renderer actually supports: `align`, `center`, `icon`, `rect`, `stack`, and `text`.
- Hardened the Rust engine to reject invalid scene durations, missing child references, and reachable child cycles instead of rendering silently corrupted frames.
- Added Bun and Rust regression tests to lock in the schema boundary and invalid-scene behavior.
- Added a small AI conversion guard so generated durations never round down to zero frames.

### Verification

- `bun test lib/video/schema.test.ts app/api/render/route.test.ts lib/video/lucide.test.ts`
- `bun x tsc --noEmit`
- `cargo test` in `engine/`
- `cargo clippy --all-targets --locked -- -D warnings` in `engine/`

---

## Home Preview Panel Height

- [x] Remove the left-column fixed-height workaround from the home preview panel.
- [x] Give the home preview panel itself a bounded height so both columns stretch to the same row height.
- [x] Reuse the same inner sizing pattern as the playground preview panel and verify linting.

---

## LaTeX Math Rendering

- [x] Detect display-math text nodes wrapped in `$$...$$` during AI node resolution.
- [x] Convert LaTeX into MathJax SVG, flatten the SVG into path primitives, and reuse the existing icon renderer.
- [x] Teach the AI prompt catalog that `$$...$$` renders display math.
- [x] Add focused regression tests for LaTeX parsing and node conversion.
- [x] Verify Bun tests, TypeScript, Ultracite, Rust tests, Clippy, Rust release build, and Next.js production build.

### Review

- Added `lib/video/latex.ts`, which uses MathJax to render display math and converts the resulting SVG into flattened path primitives that fit the existing `icon` node contract.
- Updated `resolveAiSceneNodes()` so AI-generated text nodes wrapped in `$$...$$` become filled icon nodes while preserving layout and transform properties.
- Updated the prompt catalog to explicitly tell the model to wrap display math in `$$...$$` when LaTeX rendering is desired.

### Verification

- `bun test`
- `bun x tsc --noEmit`
- `bun x ultracite check`
- `cargo test` in `engine/`
- `cargo clippy --all-targets --locked -- -D warnings` in `engine/`
- `cargo build --release` in `engine/`
- `bun run build`

---

## Modal R2 Render Delivery

- [x] Add a production Modal render endpoint that renders with the Rust engine, uploads the MP4 to R2, and returns render metadata.
- [x] Add a lean Next.js render provider switch so `/api/render` uses Modal by default and local rendering only when configured.
- [x] Keep the frontend response contract stable so `video.url` continues to drive playback without UI churn.
- [x] Update focused render-route coverage for the provider switch and response contract.
- [x] Run targeted verification and document the final behavior.

### Review

- Added `scripts/modal_render_api.py` as a dedicated production Modal endpoint that renders with the existing Rust engine, uploads the finished MP4 to R2, and returns the same core metadata the app already expects.
- Kept the Next.js integration lean by teaching `lib/video/render-video.ts` to choose between the existing local Rust path and the new Modal path based on env, while preserving the `publicUrl` contract used by the UI.
- Added a small server-only `lib/video/modal-render.ts` helper plus remote object-key helpers in `lib/video/storage.ts` so the orchestration logic stays narrow and the frontend did not need to change.
- Added focused provider-switch coverage in `lib/video/render-video.test.ts` and kept the existing `/api/render` route contract unchanged.

### Verification

- `bun test app/api/render/route.test.ts lib/video/render-video.test.ts`
- `bun run typecheck`
- `bunx ultracite check lib/video/config.ts lib/video/storage.ts lib/video/modal-render.ts lib/video/render-video.ts lib/video/render-video.test.ts app/api/render/route.ts app/api/render/route.test.ts`
- `python3 -m py_compile scripts/modal_render_api.py`

### Notes

- Verified the local and orchestration code paths in-repo, but did not run a live end-to-end Modal render because that requires a deployed Modal endpoint plus configured R2 environment variables in the remote runtime.

---

## Line/Arrow Unification

- [x] Collapse `arrow` into `line` in the shared TS schema and exported types while preserving absolute `x1`/`y1`/`x2`/`y2` lines.
- [x] Add reference-based `from` / `to` endpoints plus `head` / `headSize`, update validation, macros, and prompt guidance with a correct example.
- [x] Remove the separate arrow path from the Rust schema, layout, resolve, CPU render, and GPU geometry/backend so endpoint-based lines resolve after layout.
- [x] Add focused TS and Rust regression coverage for headed lines and reference-based line resolution, then run targeted tests.
- [x] Split the work into many small conventional commits, push a review branch, open a PR, and redeploy the Modal render service.

### Review

- Unified the AI-facing stroke model around `line`, keeping coordinate mode for geometric strokes and adding deferred `from`/`to` endpoint refs plus optional `head` metadata for connectors.
- Removed the separate arrow codepath from the Rust schema and renderers so CPU and GPU now resolve and draw headed lines through the same primitive.
- Kept the prompt update narrow: the catalog now forbids a separate arrow concept and includes one concrete endpoint-based connector example.
- Included the unrelated archived OpenSpec moves as separate `chore(openspec)` commits so review of the actual feature change stays clean.

### Verification

- `bun test lib/video/schema.test.ts lib/video/line.test.ts`
- `bun x tsc --noEmit`
- `bun x ultracite check lib/video/schema.ts lib/video/schema.test.ts lib/video/line.test.ts lib/video/validation.ts lib/types/video.ts lib/ai/prompt-to-video-config.ts`
- `cargo test` in `engine/`
- `cargo test --features gpu gpu_backend_submit_frame_should_render_vector_primitives -- --nocapture` in `engine/`
- `cargo build --release --features gpu` in `engine/`
- `modal deploy scripts/modal_render_api.py`

### Result

- Modal redeployed successfully with the rebuilt GPU-enabled Rust engine.
- Web function: `https://ojas-singh02--motion-modal-render-render-video.modal.run`
- Deployment page: `https://modal.com/apps/ojas-singh02/main/deployed/motion-modal-render`
