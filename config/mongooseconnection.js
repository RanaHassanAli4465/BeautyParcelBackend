const mongoose = require('mongoose');
const mongoURI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/UserArea";
mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log('MongoDB connection error:', err));

module.exports = mongoose.connection;
