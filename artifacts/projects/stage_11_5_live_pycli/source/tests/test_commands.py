import pytest
from unittest.mock import patch

from todo_cli.commands import cmd_add, cmd_list, cmd_complete, cmd_delete


EMPTY = []
ONE_ITEM = [{"id": 1, "title": "Buy milk", "completed": False}]
TWO_ITEMS = [
    {"id": 1, "title": "Buy milk", "completed": False},
    {"id": 2, "title": "Walk dog", "completed": False},
]


def test_add_creates_item(capsys):
    saved = []
    with patch("todo_cli.commands.load_items", return_value=[]), \
         patch("todo_cli.commands.save_items", side_effect=lambda x: saved.extend(x)):
        cmd_add("Buy milk")
    assert len(saved) == 1
    assert saved[0]["title"] == "Buy milk"
    assert saved[0]["completed"] is False
    assert saved[0]["id"] == 1


def test_list_empty(capsys):
    with patch("todo_cli.commands.load_items", return_value=[]):
        cmd_list()
    out = capsys.readouterr().out
    assert "No items" in out


def test_complete_marks_done(capsys):
    items = [{"id": 1, "title": "Buy milk", "completed": False}]
    saved = []
    with patch("todo_cli.commands.load_items", return_value=items), \
         patch("todo_cli.commands.save_items", side_effect=lambda x: saved.extend(x)):
        cmd_complete(1)
    assert saved[0]["completed"] is True


def test_delete_removes_item():
    items = [{"id": 1, "title": "Buy milk", "completed": False},
             {"id": 2, "title": "Walk dog", "completed": False}]
    saved = []
    with patch("todo_cli.commands.load_items", return_value=items), \
         patch("todo_cli.commands.save_items", side_effect=lambda x: saved.extend(x)):
        cmd_delete(1)
    ids = [i["id"] for i in saved]
    assert 1 not in ids
    assert 2 in ids
