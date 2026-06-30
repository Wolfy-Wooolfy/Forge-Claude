const express = require('express');
const noteStore = require('../models/noteStore');
const generateId = require('../utils/idGenerator');
const validateNoteInput = require('../middleware/validation');

const router = express.Router();

router.post('/notes', validateNoteInput, (req, res) => {
    const { title, body, category, tags } = req.body;
    const id = generateId();
    const note = { id, title, body, category, tags };
    noteStore.create(note);
    res.status(201).json(note);
});

router.get('/notes', (req, res) => {
    const { category, q } = req.query;
    const notes = noteStore.list(q, category);
    res.json(notes);
});

router.get('/notes/:id', (req, res) => {
    const { id } = req.params;
    const note = noteStore.retrieve(parseInt(id));
    if (!note) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
});

router.put('/notes/:id', validateNoteInput, (req, res) => {
    const { title, body, category, tags } = req.body;
    const { id } = req.params;
    const updatedNote = { id: parseInt(id), title, body, category, tags };
    const result = noteStore.update(parseInt(id), updatedNote);
    if (!result) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.json(result);
});

router.delete('/notes/:id', (req, res) => {
    const { id } = req.params;
    const result = noteStore.delete(parseInt(id));
    if (!result) {
        return res.status(404).json({ error: 'Note not found' });
    }
    res.status(204).send();
});

module.exports = router;