const express = require('express');
const notesStore = require('../store/notesStore');

const router = express.Router();

router.post('/', (req, res) => {
    const { title, body } = req.body;
    const newNote = notesStore.createNote({ title, body });
    res.status(201).json(newNote);
});

router.get('/', (req, res) => {
    const notes = notesStore.getAllNotes();
    res.status(200).json(notes);
});

router.get('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const note = notesStore.getNoteById(id);
    if (note) {
        res.status(200).json(note);
    } else {
        res.status(404).send('Note not found');
    }
});

router.put('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { title, body } = req.body;
    const updatedNote = notesStore.updateNoteById(id, { title, body });
    if (updatedNote) {
        res.status(200).json(updatedNote);
    } else {
        res.status(404).send('Note not found');
    }
});

router.delete('/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const success = notesStore.deleteNoteById(id);
    if (success) {
        res.status(204).send();
    } else {
        res.status(404).send('Note not found');
    }
});

module.exports = router;