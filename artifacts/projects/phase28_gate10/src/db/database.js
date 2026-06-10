const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database(':memory:');

db.serialize(() => {
  db.run('CREATE TABLE todos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, completed BOOLEAN NOT NULL DEFAULT 0)');
});

module.exports = db;