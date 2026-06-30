const express = require('express');
const notesRouter = require('./notesRouter');

const app = express();

app.use(express.json());
app.use('/', notesRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
