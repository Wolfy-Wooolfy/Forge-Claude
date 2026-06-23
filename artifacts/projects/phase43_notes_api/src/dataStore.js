const notes = [];

const getNotes = () => notes;

const addNote = (note) => {
    notes.push(note);
};

const updateNote = (id, updatedNote) => {
    const index = notes.findIndex(note => note.id === id);
    if (index !== -1) {
        notes[index] = { ...notes[index], ...updatedNote };
    }
};

const deleteNote = (id) => {
    const index = notes.findIndex(note => note.id === id);
    if (index !== -1) {
        notes.splice(index, 1);
    }
};

module.exports = {
    getNotes,
    addNote,
    updateNote,
    deleteNote
};