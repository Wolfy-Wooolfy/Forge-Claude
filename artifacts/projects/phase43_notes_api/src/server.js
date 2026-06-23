const express = require('express');
const app = express();
const notesRouter = require('./routes/notes');

app.use(express.json());
app.use('/notes', notesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});