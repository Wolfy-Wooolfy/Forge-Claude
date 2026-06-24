class InMemoryStorage {
    constructor() {
        this.notes = {};
        this.currentId = 1;
    }

    create(noteData) {
        const id = this.currentId++;
        this.notes[id] = { id, ...noteData };
        return this.notes[id];
    }

    readAll(category, keyword) {
        return Object.values(this.notes).filter(note => {
            if (category && note.category !== category) {
                return false;
            }
            if (keyword && !(note.title.includes(keyword) || note.body.includes(keyword))) {
                return false;
            }
            return true;
        });
    }

    read(id) {
        return this.notes[id] || null;
    }

    update(id, noteData) {
        if (!this.notes[id]) {
            return null;
        }
        this.notes[id] = { id, ...noteData };
        return this.notes[id];
    }

    delete(id) {
        if (this.notes[id]) {
            delete this.notes[id];
            return true;
        }
        return false;
    }
}

module.exports = InMemoryStorage;