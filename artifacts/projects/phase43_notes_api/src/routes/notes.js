const express = require('express');
const router = express.Router();
const { getNotes, addNote, updateNote, deleteNote } = require('../dataStore');
const { validateNote } = require('../validationMiddleware');

router.get('/', (req, res) => {
    const { category, keyword } = req.query;
    let notes = getNotes();
    if (category) {
        notes = notes.filter(note => note.category === category);
    }
    if (keyword) {
        notes = notes.filter(
            note => note.title.includes(keyword) || note.body.includes(keyword)
        );
    }
    res.json(notes);
});

router.post('/', validateNote, (req, res) => {
    const note = { id: Date.now().toString(), ...req.body };
    addNote(note);
    res.status(201).json(note);
});

router.put('/:id', validateNote, (req, res) => {
    const { id } = req.params;
    updateNote(id, req.body);
    res.status(200).json(getNotes().find(note => note.id === id));
});

router.delete('/:id', (req, res) => {
    const { id } = req.params;
    deleteNote(id);
    res.status(204).send();
});

module.exports = router;