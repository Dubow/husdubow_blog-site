const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

// Authentication Middleware
const authMiddleware = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1]; // Expecting "Bearer <token>"
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ error: 'Invalid token' });
        req.user = decoded;
        if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
        next();
    });
};

// Admin Login
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = results[0];
        bcrypt.compare(password, user.password, (err, match) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!match || !user.is_admin) return res.status(401).json({ error: 'Invalid credentials' });

            const token = jwt.sign({ id: user.id, is_admin: user.is_admin }, process.env.JWT_SECRET, {
                expiresIn: '1h' // Token expires in 1 hour
            });
            res.json({ token });
        });
    });
});

// Admin Upload (Protected)
app.post('/admin/upload', authMiddleware, (req, res) => {
    const { file, title, content, type } = req.body; // Assume file is a base64 string or URL for now
    
    cloudinary.uploader.upload(file, { resource_type: type === 'video' ? 'video' : 'image' }, (error, result) => {
        if (error) return res.status(500).json({ error: 'Upload failed' });
        
        const mediaUrl = result.secure_url;
        db.query(
            'INSERT INTO posts (title, content, type, media_url, user_id) VALUES (?, ?, ?, ?, ?)',
            [title, content, type, mediaUrl, req.user.id],
            (err) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ message: 'Post created', media_url: mediaUrl });
            }
        );
    });
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