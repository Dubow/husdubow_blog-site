const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs');

dotenv.config({ path: path.join(__dirname, '..', '.env') });
console.log('JWT_SECRET:', process.env.JWT_SECRET);

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// MySQL Connection Pool with Aiven SSL
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 14617,
    ssl: {
        ca: fs.readFileSync(path.join(__dirname, '..', 'ca.pem'))
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

const db = pool.promise(); // Use promise-based API for async/await

// Log pool events for debugging
pool.on('connection', () => {
    console.log('MySQL Pool: New connection established');
});

pool.on('error', (err) => {
    console.error('MySQL Pool Error:', err);
});

// Test the connection on startup
(async () => {
    try {
        await db.query('SELECT 1');
        console.log('MySQL Connected');
    } catch (err) {
        console.error('MySQL Connection Error:', err);
        throw err;
    }
})();

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
        next();
    });
};

// Admin Middleware
const adminMiddleware = (req, res, next) => {
    if (!req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
    next();
};

// ========== PUBLIC ROUTES ========== //

// Get all posts with like/comment counts
app.get('/api/posts', async (req, res) => {
    try {
        const [results] = await db.query(`
            SELECT p.*, u.username as author,
                   COUNT(DISTINCT l.id) as likes_count,
                   COUNT(DISTINCT c.id) as comments_count
            FROM posts p
            JOIN users u ON p.user_id = u.id
            LEFT JOIN likes l ON p.id = l.post_id
            LEFT JOIN comments c ON p.id = c.post_id
            GROUP BY p.id
            ORDER BY p.created_at DESC
        `);
        res.json(results);
    } catch (err) {
        console.error('Database error in /api/posts:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Get comments for a post
app.get('/api/posts/:id/comments', async (req, res) => {
    try {
        const [results] = await db.query(`
            SELECT c.*, u.username 
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.post_id = ?
            ORDER BY c.created_at
        `, [req.params.id]);
        res.json(results);
    } catch (err) {
        console.error('Database error in /api/posts/:id/comments:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// User signup
app.post('/api/signup', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    try {
        const [existingUsers] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (existingUsers.length > 0) return res.status(400).json({ error: 'Username already exists' });
        
        const hash = await bcrypt.hash(password, 10);
        await db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, hash]);
        res.json({ message: 'User created successfully' });
    } catch (err) {
        console.error('Database error in /api/signup:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// User login (for both regular users and admin)
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const [results] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });
        
        const token = jwt.sign({ 
            id: user.id, 
            username: user.username,
            is_admin: user.is_admin 
        }, process.env.JWT_SECRET, {
            expiresIn: '7d'
        });
        res.json({ token });
    } catch (err) {
        console.error('Database error in /api/login:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// ========== AUTHENTICATED ROUTES ========== //

// Like/Unlike a post
app.post('/api/posts/:id/like', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    try {
        const [results] = await db.query('SELECT id FROM likes WHERE user_id = ? AND post_id = ?', [userId, id]);
        
        if (results.length > 0) {
            // Unlike
            await db.query('DELETE FROM likes WHERE id = ?', [results[0].id]);
        } else {
            // Like
            await db.query('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', [userId, id]);
        }
        
        const [likeCount] = await db.query('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', [id]);
        res.json({ likes_count: likeCount[0].count });
    } catch (err) {
        console.error('Database error in /api/posts/:id/like:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Add comment
app.post('/api/posts/:id/comments', authMiddleware, async (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    
    try {
        const [result] = await db.query(`
            INSERT INTO comments (user_id, post_id, content)
            VALUES (?, ?, ?)
        `, [req.user.id, req.params.id, content]);
        
        const [newComment] = await db.query(`
            SELECT c.*, u.username 
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [result.insertId]);
        
        res.json(newComment[0]);
    } catch (err) {
        console.error('Database error in /api/posts/:id/comments:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// ========== ADMIN ROUTES ========== //

// Admin Login
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
        const [results] = await db.query('SELECT * FROM users WHERE username = ? AND is_admin = TRUE', [username]);
        if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = results[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ 
            id: user.id, 
            is_admin: user.is_admin 
        }, process.env.JWT_SECRET, {
            expiresIn: '1h'
        });
        res.json({ token });
    } catch (err) {
        console.error('Database error in /admin/login:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Upload Media (For TinyMCE)
app.post('/admin/upload-media', authMiddleware, adminMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (error, result) => {
        if (error) {
            console.error('Cloudinary Upload Error:', error);
            return res.status(500).json({ error: 'Upload failed', details: error.message });
        }
        res.json({ media_url: result.secure_url });
    }).end(req.file.buffer);
});

// Admin Upload (Create Post)
app.post('/admin/upload', authMiddleware, adminMiddleware, async (req, res) => {
    const { title, content } = req.body;

    try {
        await db.query('INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)', [title, content, req.user.id]);
        res.json({ message: 'Post created' });
    } catch (err) {
        console.error('Database error in /admin/upload:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Get All Posts (Admin Only)
app.get('/admin/posts', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const [results] = await db.query('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC', [req.user.id]);
        res.json(results);
    } catch (err) {
        console.error('Database error in /admin/posts:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Edit Post (Admin Only)
app.put('/admin/posts/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;

    try {
        const [results] = await db.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (results.length === 0) return res.status(404).json({ error: 'Post not found' });

        await db.query('UPDATE posts SET title = ?, content = ? WHERE id = ?', [title, content, id]);
        res.json({ message: 'Post updated' });
    } catch (err) {
        console.error('Database error in /admin/posts/:id (PUT):', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Delete Post (Admin Only)
app.delete('/admin/posts/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const { id } = req.params;

    try {
        const [results] = await db.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [id, req.user.id]);
        if (results.length === 0) return res.status(404).json({ error: 'Post not found' });

        const post = results[0];
        const mediaUrls = post.content.match(/https:\/\/res\.cloudinary\.com\/[^"]+/g) || [];

        // Step 1: Delete associated comments
        await db.query('DELETE FROM comments WHERE post_id = ?', [id]);

        // Step 2: Delete associated likes
        await db.query('DELETE FROM likes WHERE post_id = ?', [id]);

        // Step 3: Delete Cloudinary media
        let mediaDeleteErrors = [];
        if (mediaUrls.length > 0) {
            for (const url of mediaUrls) {
                const publicId = url.split('/').pop().split('.')[0];
                try {
                    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
                } catch (error) {
                    console.error('Cloudinary delete error:', error);
                    mediaDeleteErrors.push({ publicId, error: error.message });
                }
            }
        }

        // Step 4: Delete the post
        await db.query('DELETE FROM posts WHERE id = ?', [id]);

        if (mediaDeleteErrors.length > 0) {
            return res.status(207).json({ 
                message: 'Post and dependencies deleted, but some media failed to delete',
                errors: mediaDeleteErrors 
            });
        }
        res.json({ message: 'Post deleted successfully' });
    } catch (err) {
        console.error('Database error in /admin/posts/:id (DELETE):', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Get Analytics (Admin Only)
app.get('/admin/analytics', authMiddleware, adminMiddleware, async (req, res) => {
    const { period } = req.query;

    let groupBy;
    switch (period) {
        case 'day': groupBy = 'DATE'; break;
        case 'week': groupBy = 'WEEK'; break;
        case 'month': groupBy = 'MONTH'; break;
        case 'year': groupBy = 'YEAR'; break;
        default: return res.status(400).json({ error: 'Invalid period' });
    }

    const likesQuery = `
        SELECT ${groupBy}(likes.created_at) as period, COUNT(*) as count 
        FROM likes 
        JOIN posts ON likes.post_id = posts.id 
        WHERE posts.user_id = ? 
        GROUP BY ${groupBy}(likes.created_at)
    `;
    const commentsQuery = `
        SELECT ${groupBy}(comments.created_at) as period, COUNT(*) as count 
        FROM comments 
        JOIN posts ON comments.post_id = posts.id 
        WHERE posts.user_id = ? 
        GROUP BY ${groupBy}(comments.created_at)
    `;

    try {
        const [likes] = await db.query(likesQuery, [req.user.id]);
        const [comments] = await db.query(commentsQuery, [req.user.id]);
        res.json({ likes, comments });
    } catch (err) {
        console.error('Database error in /admin/analytics:', err);
        res.status(500).json({ error: 'Database error', details: err.message });
    }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('Server Error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    res.status(500).json({ error: 'Something went wrong!', details: err.message });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});