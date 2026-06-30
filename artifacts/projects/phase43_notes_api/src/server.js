const express = require('express');
const notesRoutes = require('./routes/notes');

const app = express();

app.use(express.json());
app.use('', notesRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});