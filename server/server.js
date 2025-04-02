const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const cloudinary = require('cloudinary').v2;

dotenv.config();
const app = express();

// Middleware
app.use(express.json());
app.use(express.static('../public'));

// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
});

db.connect(err => {
    if (err) throw err;
    console.log('MySQL Connected');
});

// Cloudinary Configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Test Route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is running!' });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});