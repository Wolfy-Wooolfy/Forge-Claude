package cmd

import (
	"fmt"
	"os"

	"github.com/forge-demo/todo_gocli/storage"
)

func Add(store *storage.Store, title string) {
	item := storage.Item{
		ID:        store.NextID,
		Title:     title,
		Completed: false,
	}
	store.Items = append(store.Items, item)
	store.NextID++
	fmt.Printf("added task #%d: %s\n", item.ID, item.Title)
}

func List(store *storage.Store) {
	if len(store.Items) == 0 {
		fmt.Println("no tasks")
		return
	}
	for _, item := range store.Items {
		status := " "
		if item.Completed {
			status = "x"
		}
		fmt.Printf("[%s] #%d %s\n", status, item.ID, item.Title)
	}
}

func Complete(store *storage.Store, id int) {
	for i := range store.Items {
		if store.Items[i].ID == id {
			store.Items[i].Completed = true
			fmt.Printf("marked #%d complete\n", id)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "task #%d not found\n", id)
	os.Exit(1)
}

func Delete(store *storage.Store, id int) {
	for i, item := range store.Items {
		if item.ID == id {
			store.Items = append(store.Items[:i], store.Items[i+1:]...)
			fmt.Printf("deleted task #%d\n", id)
			return
		}
	}
	fmt.Fprintf(os.Stderr, "task #%d not found\n", id)
	os.Exit(1)
}
