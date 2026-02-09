const mongoose = require('mongoose');

const orderSchema = mongoose.Schema({
    userEmail: String, // ⭐ User ki pehchan ke liye
    name: String,
    address: String,
    phone: String,
    items: Array,
    totalBill: Number,
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('order', orderSchema);