const express = require('express');
const app = express();
const todosRouter = require('./routes/todos');
const errorHandler = require('./middleware/errorHandler');

app.use(express.json());
app.use('/todos', todosRouter);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});