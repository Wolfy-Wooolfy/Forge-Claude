const express = require('express');
const notesController = require('./notesController');

const router = express.Router();

router.post('/notes', notesController.createNote);
router.get('/notes', notesController.getAllNotes);
router.get('/notes/:id', notesController.getNoteById);
router.put('/notes/:id', notesController.updateNoteById);
router.delete('/notes/:id', notesController.deleteNoteById);

module.exports = router;
