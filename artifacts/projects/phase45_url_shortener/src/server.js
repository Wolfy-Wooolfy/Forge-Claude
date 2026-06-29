const express = require('express');
const urlRoutes = require('./routes/urlRoutes');
const app = express();
app.use(express.json());
app.use('/', urlRoutes);
app.listen(process.env.PORT || 3000, () => {
    console.log('Server is running on port', process.env.PORT || 3000);
});