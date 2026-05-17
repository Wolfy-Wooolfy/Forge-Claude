package main

import (
	"flag"
	"fmt"
	"os"
	"strconv"

	"github.com/forge-demo/todo_gocli/cmd"
	"github.com/forge-demo/todo_gocli/storage"
)

func main() {
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "usage: todo <command> [args]")
		fmt.Fprintln(os.Stderr, "  add <title>     add a new task")
		fmt.Fprintln(os.Stderr, "  list            list all tasks")
		fmt.Fprintln(os.Stderr, "  complete <id>   mark a task complete")
		fmt.Fprintln(os.Stderr, "  delete <id>     delete a task")
	}
	flag.Parse()

	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		os.Exit(1)
	}

	store, err := storage.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, "error loading storage:", err)
		os.Exit(1)
	}

	command := args[0]
	switch command {
	case "add":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "add requires a title")
			os.Exit(1)
		}
		cmd.Add(store, args[1])
	case "list":
		cmd.List(store)
	case "complete":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "complete requires an id")
			os.Exit(1)
		}
		id, err := strconv.Atoi(args[1])
		if err != nil {
			fmt.Fprintln(os.Stderr, "id must be an integer")
			os.Exit(1)
		}
		cmd.Complete(store, id)
	case "delete":
		if len(args) < 2 {
			fmt.Fprintln(os.Stderr, "delete requires an id")
			os.Exit(1)
		}
		id, err := strconv.Atoi(args[1])
		if err != nil {
			fmt.Fprintln(os.Stderr, "id must be an integer")
			os.Exit(1)
		}
		cmd.Delete(store, id)
	default:
		fmt.Fprintln(os.Stderr, "unknown command:", command)
		flag.Usage()
		os.Exit(1)
	}

	if err := storage.Save(store); err != nil {
		fmt.Fprintln(os.Stderr, "error saving storage:", err)
		os.Exit(1)
	}
}
