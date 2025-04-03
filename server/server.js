const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
console.log('JWT_SECRET:', process.env.JWT_SECRET);

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Multer Error Handling Middleware
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        console.log('Multer Error:', err.message);
        return res.status(400).json({ error: 'File upload error', details: err.message });
    }
    next(err);
};

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
    const token = req.headers['authorization']?.split(' ')[1];
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

            if (!process.env.JWT_SECRET) {
                return res.status(500).json({ error: 'JWT_SECRET is not defined' });
            }

            const token = jwt.sign({ id: user.id, is_admin: user.is_admin }, process.env.JWT_SECRET, {
                expiresIn: '1h'
            });
            res.json({ token });
        });
    });
});

// Upload Media (For TinyMCE)
app.post('/admin/upload-media', authMiddleware, upload.single('file'), handleMulterError, (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    cloudinary.uploader.upload_stream(
        { resource_type: 'auto' },
        (error, result) => {
            if (error) {
                console.log('Cloudinary Upload Error:', error);
                return res.status(500).json({ error: 'Upload failed', details: error.message });
            }
            res.json({ media_url: result.secure_url });
        }
    ).end(req.file.buffer);
});

// Admin Upload (Create Post)
app.post('/admin/upload', authMiddleware, (req, res) => {
    const { title, content } = req.body;

    db.query(
        'INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)',
        [title, content, req.user.id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Post created' });
        }
    );
});

// Get All Posts (Admin Only)
app.get('/admin/posts', authMiddleware, (req, res) => {
    db.query(
        'SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id],
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json(results);
        }
    );
});

// Edit Post (Admin Only)
app.put('/admin/posts/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;

    db.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [id, req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(404).json({ error: 'Post not found' });

        db.query(
            'UPDATE posts SET title = ?, content = ? WHERE id = ?',
            [title, content, id],
            (err) => {
                if (err) return res.status(500).json({ error: 'Database error' });
                res.json({ message: 'Post updated' });
            }
        );
    });
});

// Delete Post (Admin Only)
app.delete('/admin/posts/:id', authMiddleware, (req, res) => {
    const { id } = req.params;

    db.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [id, req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (results.length === 0) return res.status(404).json({ error: 'Post not found' });

        const post = results[0];
        const mediaUrls = post.content.match(/https:\/\/res\.cloudinary\.com\/[^"]+/g) || [];
        mediaUrls.forEach(url => {
            const publicId = url.split('/').pop().split('.')[0];
            cloudinary.uploader.destroy(publicId, { resource_type: 'auto' }, (error) => {
                if (error) console.error('Cloudinary delete error:', error);
            });
        });

        db.query('DELETE FROM posts WHERE id = ?', [id], (err) => {
            if (err) return res.status(500).json({ error: 'Database error' });
            res.json({ message: 'Post deleted' });
        });
    });
});

// Get Analytics (Admin Only)
app.get('/admin/analytics', authMiddleware, (req, res) => {
    const { period } = req.query;

    let groupBy;
    switch (period) {
        case 'day':
            groupBy = 'DATE(created_at)';
            break;
        case 'week':
            groupBy = 'WEEK(created_at)';
            break;
        case 'month':
            groupBy = 'MONTH(created_at)';
            break;
        case 'year':
            groupBy = 'YEAR(created_at)';
            break;
        default:
            return res.status(400).json({ error: 'Invalid period' });
    }

    db.query(
        `SELECT ${groupBy} as period, COUNT(*) as count FROM likes 
         JOIN posts ON likes.post_id = posts.id 
         WHERE posts.user_id = ? 
         GROUP BY ${groupBy}`,
        [req.user.id],
        (err, likes) => {
            if (err) return res.status(500).json({ error: 'Database error' });

            db.query(
                `SELECT ${groupBy} as period, COUNT(*) as count FROM comments 
                 JOIN posts ON comments.post_id = posts.id 
                 WHERE posts.user_id = ? 
                 GROUP BY ${groupBy}`,
                [req.user.id],
                (err, comments) => {
                    if (err) return res.status(500).json({ error: 'Database error' });
                    res.json({ likes, comments });
                }
            );
        }
    );
});

// Test Route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is running!' });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});