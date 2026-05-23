import asyncio
import hashlib
import importlib.resources
import logging
import os
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Optional

# Make pylingual package importable
PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from pylingual.decompiler import decompile
from pylingual.editable_bytecode import PYCFile


logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
UPLOAD_DIR = Path(os.getenv("PYLINGUAL_UPLOAD_DIR", str(Path(__file__).parent / "uploads")))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = Path(__file__).parent / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

MAX_UPLOAD_SIZE = 50 * 1024 * 1024


# ── Model cache ───────────────────────────────────────────────────────────────
_model_cache: dict[str, tuple] = {}
_model_lock = threading.Lock()


def _load_models_cached(version) -> tuple:
    key = str(version)
    if key in _model_cache:
        return _model_cache[key]
    with _model_lock:
        if key in _model_cache:
            return _model_cache[key]
        pkg_path = importlib.resources.files("pylingual")
        with importlib.resources.as_file(pkg_path.joinpath("decompiler_config.yaml")) as cfg:
            config_file = Path(cfg)
        from pylingual.models import load_models
        segmenter, translator = load_models(config_file, version)
        _model_cache[key] = (segmenter, translator)
        return _model_cache[key]


# ── TrackedList hooks ─────────────────────────────────────────────────────────
_tl_local = threading.local()


@contextmanager
def _tracked_list_hooks(
    on_init: Callable[[str, int], None],
    on_progress: Callable[[str, int, Optional[int]], None],
):
    from pylingual.utils.tracked_list import TrackedList

    _tl_local.on_init = on_init
    _tl_local.on_progress = on_progress
    _tl_local.finalized_ids: set[int] = set()

    orig_init = TrackedList.init
    orig_progress = TrackedList.progress
    orig_del = getattr(TrackedList, "__del__", lambda self: None)

    def patched_init(self):
        self._tl_total = len(self.x)
        self._tl_finalized = False
        cb = getattr(_tl_local, "on_init", None)
        if cb:
            cb(self.name, self._tl_total)

    def patched_progress(self, i: int):
        self.i = getattr(self, "i", 0) + i
        cb = getattr(_tl_local, "on_progress", None)
        if cb:
            cb(self.name, self.i, getattr(self, "_tl_total", None))

    def patched_del(self):
        if getattr(self, "_tl_finalized", False):
            return
        self._tl_finalized = True
        obj_id = id(self)
        finalized = getattr(_tl_local, "finalized_ids", set())
        if obj_id in finalized:
            return
        finalized.add(obj_id)
        cb = getattr(_tl_local, "on_progress", None)
        if cb:
            total = getattr(self, "_tl_total", None)
            cb(self.name, total if total is not None else len(self.x), total)

    TrackedList.init = patched_init
    TrackedList.progress = patched_progress
    TrackedList.__del__ = patched_del
    try:
        yield
    finally:
        TrackedList.init = orig_init
        TrackedList.progress = orig_progress
        TrackedList.__del__ = orig_del
        _tl_local.finalized_ids, _tl_local.on_init, _tl_local.on_progress = set(), None, None


# ── Decompilation service ─────────────────────────────────────────────────────
class DecompilationService:
    def __init__(
        self,
        task_id: str,
        pyc_path: Path,
        version: Optional[str],
        on_progress: Callable[[str, int, Optional[int]], None],
        on_success: Callable[[str, str, str], None],
        on_error: Callable[[str], None],
    ):
        self.task_id = task_id
        self.pyc_path = pyc_path
        self.version = version
        self.on_progress = on_progress
        self.on_success = on_success
        self.on_error = on_error

    def run(self):
        from pylingual.utils.version import PythonVersion
        from pylingual.equivalence_check import TestResult

        try:
            if not self.pyc_path.exists():
                raise FileNotFoundError(f"Upload not found: {self.pyc_path}")

            pyver = None
            if self.version:
                try:
                    pyver = PythonVersion(self.version)
                except Exception:
                    pyver = None

            with _tracked_list_hooks(
                on_init=lambda name, total: self.on_progress(name, 0, total),
                on_progress=lambda name, cur, tot: self.on_progress(name, cur, tot),
            ):
                _load_models_cached(pyver or "3.10")

                result = decompile(
                    pyc=self.pyc_path,
                    save_to=None,
                    config_file=None,
                    version=pyver,
                    top_k=10,
                    trust_lnotab=False,
                )

            source = result.decompiled_source
            eq_results = result.equivalence_results or []
            tests = [r for r in eq_results if isinstance(r, TestResult)]
            if tests:
                success_rate = f"{sum(1 for t in tests if t.success) / len(tests) * 100:.1f}%"
            else:
                success_rate = "N/A"

            self.on_success(source, success_rate, str(result.version))

        except Exception as e:
            msg = str(e)
            notes = getattr(e, "__notes__", None)
            if notes:
                msg += " | " + "; ".join(str(n) for n in notes)
            self.on_error(msg)


# ── FastAPI app ────────────────────────────────────────────────────────────────
app = FastAPI(title="PyLingual Web", version="1.0.0")


@app.post("/api/upload")
async def upload_pyc(
    file: UploadFile = File(...),
    version: Optional[str] = Form(None),
):
    if not file.filename or not file.filename.endswith(".pyc"):
        raise HTTPException(status_code=400, detail="仅支持 .pyc 文件")

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大（最大 {MAX_UPLOAD_SIZE // 1024 // 1024}MB）",
        )

    file_hash = hashlib.sha256(contents + str(time.time()).encode()).hexdigest()
    task_id = uuid.uuid5(uuid.NAMESPACE_DNS, file_hash).hex[:16]
    (UPLOAD_DIR / f"{task_id}.pyc").write_bytes(contents)

    return {"task_id": task_id, "filename": file.filename, "size": len(contents)}


@app.get("/api/models")
async def list_models():
    return {"models": list(_model_cache.keys())}


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── WebSocket decompile endpoint ──────────────────────────────────────────────
@app.websocket("/ws/{task_id}")
async def ws_decompile(websocket: WebSocket, task_id: str):
    await websocket.accept()

    pyc_path = UPLOAD_DIR / f"{task_id}.pyc"
    if not pyc_path.exists():
        await websocket.send_json({"type": "error", "message": f"任务 {task_id} 未找到"})
        await websocket.close()
        return

    loop = asyncio.get_running_loop()
    msg_queue: asyncio.Queue[dict] = asyncio.Queue()

    def send_msg(msg: dict):
        asyncio.run_coroutine_threadsafe(msg_queue.put(msg), loop)

    def on_progress(stage: str, current: int, total: Optional[int]):
        payload: dict = {"type": "progress", "stage": stage, "current": current}
        if total is not None:
            payload["total"] = total
        send_msg(payload)

    def on_success(source: str, success_rate: str, version: str):
        send_msg({
            "type": "complete",
            "source_code": source,
            "success_rate": success_rate,
            "version": version,
        })

    def on_error(message: str):
        send_msg({"type": "error", "message": message})

    version_param = websocket.query_params.get("version")

    svc = DecompilationService(
        task_id, pyc_path, version_param,
        on_progress, on_success, on_error,
    )
    thread = threading.Thread(target=svc.run, daemon=True)
    thread.start()

    try:
        while True:
            try:
                msg = await asyncio.wait_for(msg_queue.get(), timeout=1.0)
                await websocket.send_json(msg)
                if msg.get("type") in ("complete", "error"):
                    break
            except asyncio.TimeoutError:
                if not thread.is_alive():
                    await websocket.send_json({
                        "type": "error",
                        "message": "反编译进程异常终止",
                    })
                    break
                await websocket.send_json({"type": "ping"})
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for task {task_id}")
    finally:
        try:
            pyc_path.unlink(missing_ok=True)
        except Exception:
            pass


# ── Catch-all: serve frontend ─────────────────────────────────────────────────
_assets_dir = STATIC_DIR / "assets"
if _assets_dir.exists():
    app.mount("/assets", StaticFiles(directory=_assets_dir), name="static_assets")


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        return JSONResponse({
            "message": "Py大星 反编译器 API",
            "docs": "/docs",
            "frontend_built": False,
        })
    if full_path and not full_path.startswith(("api/", "ws/", "assets/")):
        candidate = STATIC_DIR / full_path
        if candidate.exists() and candidate.is_file():
            return HTMLResponse(candidate.read_text(encoding="utf-8"))
    return HTMLResponse(index_path.read_text(encoding="utf-8"))


# ── Entry point ────────────────────────────────────────────────────────────────
def setup_logging():
    from rich.logging import RichHandler
    logging.basicConfig(
        level="INFO",
        format="%(message)s",
        datefmt="[%X]",
        handlers=[RichHandler(rich_tracebacks=True)],
        force=True,
    )


if __name__ == "__main__":
    import uvicorn
    setup_logging()
    uvicorn.run(
        "web_app.app:app",
        host=os.getenv("PYLINGUAL_HOST", "0.0.0.0"),
        port=int(os.getenv("PYLINGUAL_PORT", "8000")),
        reload=False,
    )
