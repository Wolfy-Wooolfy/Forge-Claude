const express = require('express');
const app = express();
const todoRoutes = require('./routes/todoRoutes');
const errorHandler = require('./middleware/errorHandling');

app.use(express.json());
app.use('/api', todoRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
