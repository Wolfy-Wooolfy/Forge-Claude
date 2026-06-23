const express = require('express');
const Note = require('../models/note');
const validateNoteInput = require('../middleware/validation');

const router = express.Router();
let notes = [];
let idCounter = 1;

router.post('/', validateNoteInput, (req, res) => {
  const { title, content } = req.body;
  const note = new Note(idCounter++, title, content);
  notes.push(note);
  res.status(201).json(note);
});

router.get('/', (req, res) => {
  const { search } = req.query;
  if (search) {
    const filteredNotes = notes.filter(note =>
      note.title.includes(search) || note.content.includes(search)
    );
    return res.json(filteredNotes);
  }
  res.json(notes);
});

router.get('/:id', (req, res) => {
  const note = notes.find(n => n.id === parseInt(req.params.id));
  if (!note) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json(note);
});

router.put('/:id', validateNoteInput, (req, res) => {
  const { title, content } = req.body;
  const noteIndex = notes.findIndex(n => n.id === parseInt(req.params.id));
  if (noteIndex === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }
  notes[noteIndex] = { id: notes[noteIndex].id, title, content };
  res.json(notes[noteIndex]);
});

router.delete('/:id', (req, res) => {
  const noteIndex = notes.findIndex(n => n.id === parseInt(req.params.id));
  if (noteIndex === -1) {
    return res.status(404).json({ error: 'Note not found' });
  }
  notes.splice(noteIndex, 1);
  res.status(204).send();
});

module.exports = router;
