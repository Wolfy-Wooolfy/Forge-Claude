const notesStorage = require('./notesStorage');

function validateNoteInput(note) {
  if (!note.title || note.title.length > 200) {
    return 'Title is required and must be 200 characters or less.';
  }
  return null;
}

exports.createNote = (req, res) => {
  const error = validateNoteInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const newNote = notesStorage.create(req.body);
  res.status(201).json(newNote);
};

exports.getAllNotes = (req, res) => {
  const { category, q } = req.query;
  let notes = notesStorage.getAll();

  if (category) {
    notes = notes.filter(note => note.category === category);
  }
  if (q) {
    notes = notes.filter(note => 
      note.title.includes(q) || note.body.includes(q)
    );
  }

  res.json(notes);
};

exports.getNoteById = (req, res) => {
  const note = notesStorage.getById(parseInt(req.params.id, 10));
  if (!note) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json(note);
};

exports.updateNoteById = (req, res) => {
  const error = validateNoteInput(req.body);
  if (error) {
    return res.status(400).json({ error });
  }

  const updatedNote = notesStorage.updateById(parseInt(req.params.id, 10), req.body);
  if (!updatedNote) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.json(updatedNote);
};

exports.deleteNoteById = (req, res) => {
  const success = notesStorage.deleteById(parseInt(req.params.id, 10));
  if (!success) {
    return res.status(404).json({ error: 'Note not found' });
  }
  res.status(204).send();
};
