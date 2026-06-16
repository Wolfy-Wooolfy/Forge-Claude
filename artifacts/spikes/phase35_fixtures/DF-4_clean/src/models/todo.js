const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Single shared SQLite connection for the todo store.
const db = new sqlite3.Database(path.join(__dirname, '..', '..', 'todos.db'));

db.serialize(() => {
  db.run(
    'CREATE TABLE IF NOT EXISTS todos (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'title TEXT NOT NULL, ' +
      'completed INTEGER NOT NULL DEFAULT 0' +
    ')'
  );
});

module.exports = db;
