class NoteStore {
    constructor() {
        this.notes = new Map();
    }

    create(note) {
        this.notes.set(note.id, note);
        return note;
    }

    retrieve(id) {
        return this.notes.get(id) || null;
    }

    update(id, updatedNote) {
        if (!this.notes.has(id)) {
            return null;
        }
        this.notes.set(id, updatedNote);
        return updatedNote;
    }

    delete(id) {
        return this.notes.delete(id);
    }

    list(query, category) {
        const notesArray = Array.from(this.notes.values());
        return notesArray.filter(note => {
            const matchesCategory = category ? note.category === category : true;
            const matchesQuery = query ? (note.title.includes(query) || note.body.includes(query)) : true;
            return matchesCategory && matchesQuery;
        });
    }
}

module.exports = new NoteStore();