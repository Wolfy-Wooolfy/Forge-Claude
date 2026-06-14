const db = require('../models/todo');
exports.updateTodo = (req, res) => {
  db.run('UPDATE todos SET title = ? WHERE id = ?', [req.body.title, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: req.params.id, title: req.body.title });
  });
};
