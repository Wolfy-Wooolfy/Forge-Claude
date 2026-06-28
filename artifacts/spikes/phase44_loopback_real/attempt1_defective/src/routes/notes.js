"use strict";
const express = require('express');
const router = express.Router();
const store = require('../store/notesStore');
// DEFECTIVE: no GET /notes/:id route — get-by-id falls through and 404s.
router.post('/notes', (req,res) => { const n = store.create(req.body||{}); res.status(201).json(n); });
router.get('/notes', (req,res) => { res.status(200).json(store.list()); });
router.put('/notes/:id', (req,res) => { const n = store.update(req.params.id, req.body||{}); if(!n) return res.status(404).json({error:'not found'}); res.status(200).json(n); });
router.delete('/notes/:id', (req,res) => { const ok = store.remove(req.params.id); if(!ok) return res.status(404).json({error:'not found'}); res.status(204).end(); });
module.exports = router;
