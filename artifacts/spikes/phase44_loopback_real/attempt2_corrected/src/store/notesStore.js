let notes = [];
let nextId = 1;

function createNote({ title, body }) {
    const note = { id: nextId++, title, body };
    notes.push(note);
    return note;
}

function getAllNotes() {
    return notes;
}

function getNoteById(id) {
    return notes.find(note => note.id === id) || null;
}

function updateNoteById(id, { title, body }) {
    const noteIndex = notes.findIndex(note => note.id === id);
    if (noteIndex !== -1) {
        notes[noteIndex] = { id, title, body };
        return notes[noteIndex];
    }
    return null;
}

function deleteNoteById(id) {
    const noteIndex = notes.findIndex(note => note.id === id);
    if (noteIndex !== -1) {
        notes.splice(noteIndex, 1);
        return true;
    }
    return false;
}

module.exports = {
    createNote,
    getAllNotes,
    getNoteById,
    updateNoteById,
    deleteNoteById
};