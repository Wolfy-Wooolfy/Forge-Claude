const express = require('express');
const todoRoutes = require('./routes/todoRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/api', todoRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
