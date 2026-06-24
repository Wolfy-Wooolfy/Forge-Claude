class InMemoryStorage {
  constructor() {
    this.notes = new Map();
    this.currentId = 1;
  }

  create(note) {
    const id = this.currentId++;
    this.notes.set(id, { id, ...note });
    return this.notes.get(id);
  }

  list(filter) {
    let notesArray = Array.from(this.notes.values());
    if (filter) {
      const { category, q } = filter;
      if (category) {
        notesArray = notesArray.filter(note => note.category === category);
      }
      if (q) {
        notesArray = notesArray.filter(note => note.title.includes(q) || note.body.includes(q));
      }
    }
    return notesArray;
  }

  get(id) {
    return this.notes.get(id);
  }

  update(id, noteData) {
    if (!this.notes.has(id)) return null;
    this.notes.set(id, { ...this.notes.get(id), ...noteData });
    return this.notes.get(id);
  }

  delete(id) {
    return this.notes.delete(id);
  }
}

module.exports = new InMemoryStorage();