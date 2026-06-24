const express = require('express');
const storage = require('../storage/inMemoryStorage');
const { validateNoteInput } = require('../middleware/inputValidator');

const router = express.Router();

router.post('/notes', validateNoteInput, (req, res) => {
  const note = storage.create(req.body);
  res.status(201).json(note);
});

router.get('/notes', (req, res) => {
  const { category, q } = req.query;
  const notes = storage.list({ category, q });
  res.json(notes);
});

router.get('/notes/:id', (req, res) => {
  const note = storage.get(Number(req.params.id));
  if (!note) {
    return res.status(404).json({ error: 'Note not found.' });
  }
  res.json(note);
});

router.put('/notes/:id', validateNoteInput, (req, res) => {
  const updatedNote = storage.update(Number(req.params.id), req.body);
  if (!updatedNote) {
    return res.status(404).json({ error: 'Note not found.' });
  }
  res.json(updatedNote);
});

router.delete('/notes/:id', (req, res) => {
  const success = storage.delete(Number(req.params.id));
  if (!success) {
    return res.status(404).json({ error: 'Note not found.' });
  }
  res.status(204).send();
});

module.exports = router;