import json
import os
import tempfile


_DATA_DIR = os.path.join(os.path.expanduser("~"), ".todo_cli")
_DATA_FILE = os.path.join(_DATA_DIR, "items.json")


def _ensure_data_dir():
    os.makedirs(_DATA_DIR, exist_ok=True)


def load_items():
    _ensure_data_dir()
    if not os.path.exists(_DATA_FILE):
        return []
    with open(_DATA_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def save_items(items):
    _ensure_data_dir()
    fd, tmp_path = tempfile.mkstemp(dir=_DATA_DIR, suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2)
        os.replace(tmp_path, _DATA_FILE)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
