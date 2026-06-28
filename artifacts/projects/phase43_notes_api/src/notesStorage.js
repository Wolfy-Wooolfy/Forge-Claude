class NotesStorage {
  constructor() {
    this.notes = [];
    this.nextId = 1;
  }

  create(note) {
    const newNote = { id: this.nextId++, ...note };
    this.notes.push(newNote);
    return newNote;
  }

  getAll() {
    return this.notes;
  }

  getById(id) {
    return this.notes.find(note => note.id === id) || null;
  }

  updateById(id, noteData) {
    const index = this.notes.findIndex(note => note.id === id);
    if (index === -1) {
      return null;
    }
    this.notes[index] = { ...this.notes[index], ...noteData };
    return this.notes[index];
  }

  deleteById(id) {
    const index = this.notes.findIndex(note => note.id === id);
    if (index === -1) {
      return false;
    }
    this.notes.splice(index, 1);
    return true;
  }
}

module.exports = new NotesStorage();
