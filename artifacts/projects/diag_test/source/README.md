# todo_cli

A minimal command-line TODO list manager. Items are persisted to a local JSON
file (`~/.todo_cli/items.json`). Supports: `add <title>`, `list`,
`complete <id>`, `delete <id>`. Uses `argparse` for CLI parsing, `json` for
persistence. No external dependencies beyond `pytest` for testing.

## Usage

```bash
python -m todo_cli add "Buy milk"
python -m todo_cli list
python -m todo_cli complete 1
python -m todo_cli delete 1
```

## Development

```bash
pip install pytest
pytest tests/
```

## Requirements

- Python 3.10+
- No runtime dependencies
