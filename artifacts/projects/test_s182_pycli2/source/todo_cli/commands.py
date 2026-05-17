from todo_cli.storage import load_items, save_items


def _next_id(items):
    if not items:
        return 1
    return max(item["id"] for item in items) + 1


def cmd_add(title):
    title = title.strip()
    if not title:
        print("Error: title cannot be empty")
        return
    items = load_items()
    item = {
        "id": _next_id(items),
        "title": title,
        "completed": False,
    }
    items.append(item)
    save_items(items)
    print(f"Added: [{item['id']}] {item['title']}")


def cmd_list():
    items = load_items()
    if not items:
        print("No items.")
        return
    for item in items:
        status = "x" if item["completed"] else " "
        print(f"[{status}] {item['id']}: {item['title']}")


def cmd_complete(item_id):
    items = load_items()
    for item in items:
        if item["id"] == item_id:
            if item["completed"]:
                print(f"Item {item_id} is already complete.")
                return
            item["completed"] = True
            save_items(items)
            print(f"Completed: [{item_id}] {item['title']}")
            return
    print(f"Error: item {item_id} not found")


def cmd_delete(item_id):
    items = load_items()
    remaining = [i for i in items if i["id"] != item_id]
    if len(remaining) == len(items):
        print(f"Error: item {item_id} not found")
        return
    save_items(remaining)
    print(f"Deleted item {item_id}")
