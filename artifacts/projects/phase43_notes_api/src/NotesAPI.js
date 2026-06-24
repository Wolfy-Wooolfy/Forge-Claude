const express = require('express');
const Joi = require('joi');
const InMemoryStorage = require('./InMemoryStorage');
const ValidationModule = require('./ValidationModule');

const router = express.Router();

const storage = new InMemoryStorage();

router.post('/notes', (req, res) => {
    const { error } = ValidationModule.validateNote(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    const note = storage.create(req.body);
    res.status(201).json(note);
});

router.get('/notes', (req, res) => {
    const { category, q } = req.query;
    const notes = storage.readAll(category, q);
    res.json(notes);
});

router.get('/notes/:id', (req, res) => {
    const note = storage.read(req.params.id);
    if (note) {
        res.json(note);
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

router.put('/notes/:id', (req, res) => {
    const { error } = ValidationModule.validateNote(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    const updatedNote = storage.update(req.params.id, req.body);
    if (updatedNote) {
        res.json(updatedNote);
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

router.delete('/notes/:id', (req, res) => {
    const success = storage.delete(req.params.id);
    if (success) {
        res.status(204).send();
    } else {
        res.status(404).json({ error: 'Note not found' });
    }
});

module.exports = router;