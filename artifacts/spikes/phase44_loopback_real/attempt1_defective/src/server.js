"use strict";
const express = require('express');
const app = express();
app.use(express.json());
app.use(require('./routes/notes'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Notes API on ' + PORT));
