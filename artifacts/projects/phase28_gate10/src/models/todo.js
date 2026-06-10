const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run('CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, completed BOOLEAN)');
});

const Todo = {
  create: (title, completed, callback) => {
    const stmt = db.prepare('INSERT INTO todos (title, completed) VALUES (?, ?)');
    stmt.run(title, completed, function (err) {
      callback(err, this.lastID);
    });
    stmt.finalize();
  },

  findById: (id, callback) => {
    db.get('SELECT * FROM todos WHERE id = ?', [id], (err, row) => {
      callback(err, row);
    });
  },

  findAll: (callback) => {
    db.all('SELECT * FROM todos', [], (err, rows) => {
      callback(err, rows);
    });
  },

  update: (id, title, completed, callback) => {
    const stmt = db.prepare('UPDATE todos SET title = ?, completed = ? WHERE id = ?');
    stmt.run(title, completed, id, function (err) {
      callback(err, this.changes);
    });
    stmt.finalize();
  },

  delete: (id, callback) => {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    stmt.run(id, function (err) {
      callback(err, this.changes);
    });
    stmt.finalize();
  }
};

module.exports = Todo;
