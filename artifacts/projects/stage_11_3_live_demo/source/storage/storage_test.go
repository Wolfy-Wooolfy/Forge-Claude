package storage

import (
	"os"
	"testing"
)

func TestLoadEmpty(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	store, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(store.Items) != 0 {
		t.Errorf("expected 0 items, got %d", len(store.Items))
	}
	if store.NextID != 1 {
		t.Errorf("expected NextID=1, got %d", store.NextID)
	}
}

func TestSaveAndLoad(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	store := &Store{
		Items:  []Item{{ID: 1, Title: "buy milk", Completed: false}},
		NextID: 2,
	}
	if err := Save(store); err != nil {
		t.Fatal(err)
	}
	loaded, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(loaded.Items))
	}
	if loaded.Items[0].Title != "buy milk" {
		t.Errorf("unexpected title: %s", loaded.Items[0].Title)
	}
}

func TestAtomicWrite(t *testing.T) {
	t.Setenv("HOME", t.TempDir())
	store := &Store{Items: []Item{}, NextID: 1}
	if err := Save(store); err != nil {
		t.Fatal(err)
	}
	path, _ := storePath()
	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Error("tmp file should not exist after successful save")
	}
}
