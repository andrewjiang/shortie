const express = require('express');
const routes = require('./routes');
require('./services/telegramBot'); // Import the Telegram bot to initialize it
const mongoose = require('mongoose');

const app = express();

app.use(express.json());

// Ensure that `routes` is a valid middleware function or a router
app.use('/api', routes);

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('Error connecting to MongoDB', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
