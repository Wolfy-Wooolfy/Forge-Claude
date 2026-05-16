import argparse
import sys

from todo_cli.commands import cmd_add, cmd_list, cmd_complete, cmd_delete


def build_parser():
    parser = argparse.ArgumentParser(
        prog="todo_cli",
        description="Minimal command-line TODO list manager",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    add_p = sub.add_parser("add", help="Add a new TODO item")
    add_p.add_argument("title", help="Title of the new item")

    sub.add_parser("list", help="List all TODO items")

    complete_p = sub.add_parser("complete", help="Mark an item as complete")
    complete_p.add_argument("id", type=int, help="ID of the item to complete")

    delete_p = sub.add_parser("delete", help="Delete an item")
    delete_p.add_argument("id", type=int, help="ID of the item to delete")

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    if args.command == "add":
        cmd_add(args.title)
    elif args.command == "list":
        cmd_list()
    elif args.command == "complete":
        cmd_complete(args.id)
    elif args.command == "delete":
        cmd_delete(args.id)
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
