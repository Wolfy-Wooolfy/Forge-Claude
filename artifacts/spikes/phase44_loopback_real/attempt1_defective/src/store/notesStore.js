"use strict";
let notes = [];
let nextId = 1;
module.exports = {
  create(n){ const note = { id: nextId++, title: n.title, body: n.body }; notes.push(note); return note; },
  list(){ return notes; },
  get(id){ return notes.find(x => x.id === Number(id)) || null; },
  update(id,n){ const note = notes.find(x => x.id === Number(id)); if(!note) return null; note.title = n.title; note.body = n.body; return note; },
  remove(id){ const i = notes.findIndex(x => x.id === Number(id)); if(i===-1) return false; notes.splice(i,1); return true; }
};
