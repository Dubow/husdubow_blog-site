const express = require('express');
const mysql = require('mysql2');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const fs = require('fs'); // Added for SSL CA file

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

// MySQL Connection with Aiven SSL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 14617, // Include Aiven port
    ssl: {
        ca: fs.readFileSync(path.join(__dirname,'..', 'ca.pem')) // Path to CA cert in project
    }
});

db.connect(err => {
    if (err) {
        console.error('MySQL Connection Error:', err);
        throw err; // Throw to stop the app if connection fails
    }
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
app.get('/api/posts', (req, res) => {
    db.query(`
        SELECT p.*, u.username as author,
               COUNT(DISTINCT l.id) as likes_count,
               COUNT(DISTINCT c.id) as comments_count
        FROM posts p
        JOIN users u ON p.user_id = u.id
        LEFT JOIN likes l ON p.id = l.post_id
        LEFT JOIN comments c ON p.id = c.post_id
        GROUP BY p.id
        ORDER BY p.created_at DESC
    `, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        res.json(results);
    });
});

// Get comments for a post
app.get('/api/posts/:id/comments', (req, res) => {
    db.query(`
        SELECT c.*, u.username 
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at
    `, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        res.json(results);
    });
});

// User signup
app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        if (results.length > 0) return res.status(400).json({ error: 'Username already exists' });
        
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            
            db.query(
                'INSERT INTO users (username, password) VALUES (?, ?)',
                [username, hash],
                (err) => {
                    if (err) return res.status(500).json({ error: 'Database error', details: err.message });
                    res.json({ message: 'User created successfully' });
                }
            );
        });
    });
});

// User login (for both regular users and admin)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = results[0];
        bcrypt.compare(password, user.password, (err, match) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });
            
            const token = jwt.sign({ 
                id: user.id, 
                username: user.username,
                is_admin: user.is_admin 
            }, process.env.JWT_SECRET, {
                expiresIn: '7d'
            });
            res.json({ token });
        });
    });
});

// ========== AUTHENTICATED ROUTES ========== //

// Like/Unlike a post
app.post('/api/posts/:id/like', authMiddleware, (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    
    db.query('SELECT id FROM likes WHERE user_id = ? AND post_id = ?', 
    [userId, id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        
        if (results.length > 0) {
            // Unlike
            db.query('DELETE FROM likes WHERE id = ?', [results[0].id], (err) => {
                if (err) return res.status(500).json({ error: 'Database error', details: err.message });
                getUpdatedLikeCount(id, res);
            });
        } else {
            // Like
            db.query('INSERT INTO likes (user_id, post_id) VALUES (?, ?)', 
            [userId, id], (err) => {
                if (err) return res.status(500).json({ error: 'Database error', details: err.message });
                getUpdatedLikeCount(id, res);
            });
        }
    });
});

// Add comment
app.post('/api/posts/:id/comments', authMiddleware, (req, res) => {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'Content required' });
    
    db.query(`
        INSERT INTO comments (user_id, post_id, content)
        VALUES (?, ?, ?)
    `, [req.user.id, req.params.id, content], (err, result) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        
        db.query(`
            SELECT c.*, u.username 
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.id = ?
        `, [result.insertId], (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error', details: err.message });
            res.json(results[0]);
        });
    });
});

// ========== ADMIN ROUTES ========== //

// Admin Login
app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    
    db.query('SELECT * FROM users WHERE username = ? AND is_admin = TRUE', [username], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        if (results.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

        const user = results[0];
        bcrypt.compare(password, user.password, (err, match) => {
            if (err) return res.status(500).json({ error: 'Server error' });
            if (!match) return res.status(401).json({ error: 'Invalid credentials' });

            const token = jwt.sign({ 
                id: user.id, 
                is_admin: user.is_admin 
            }, process.env.JWT_SECRET, {
                expiresIn: '1h'
            });
            res.json({ token });
        });
    });
});

// Upload Media (For TinyMCE)
app.post('/admin/upload-media', authMiddleware, adminMiddleware, upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    cloudinary.uploader.upload_stream({ resource_type: 'auto' }, (error, result) => {
        if (error) {
            console.log('Cloudinary Upload Error:', error);
            return res.status(500).json({ error: 'Upload failed', details: error.message });
        }
        res.json({ media_url: result.secure_url });
    }).end(req.file.buffer);
});

// Admin Upload (Create Post)
app.post('/admin/upload', authMiddleware, adminMiddleware, (req, res) => {
    const { title, content } = req.body;

    db.query(
        'INSERT INTO posts (title, content, user_id) VALUES (?, ?, ?)',
        [title, content, req.user.id],
        (err) => {
            if (err) return res.status(500).json({ error: 'Database error', details: err.message });
            res.json({ message: 'Post created' });
        }
    );
});

// Get All Posts (Admin Only)
app.get('/admin/posts', authMiddleware, adminMiddleware, (req, res) => {
    db.query(
        'SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC',
        [req.user.id],
        (err, results) => {
            if (err) return res.status(500).json({ error: 'Database error', details: err.message });
            res.json(results);
        }
    );
});

// Edit Post (Admin Only)
app.put('/admin/posts/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;
    const { title, content } = req.body;

    db.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [id, req.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        if (results.length === 0) return res.status(404).json({ error: 'Post not found' });

        db.query(
            'UPDATE posts SET title = ?, content = ? WHERE id = ?',
            [title, content, id],
            (err) => {
                if (err) return res.status(500).json({ error: 'Database error', details: err.message });
                res.json({ message: 'Post updated' });
            }
        );
    });
});

// Delete Post (Admin Only)
app.delete('/admin/posts/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;

    db.query('SELECT * FROM posts WHERE id = ? AND user_id = ?', [id, req.user.id], (err, results) => {
        if (err) {
            console.error('Database error during post fetch:', err);
            return res.status(500).json({ error: 'Database error', details: err.message });
        }
        if (results.length === 0) return res.status(404).json({ error: 'Post not found' });

        const post = results[0];
        const mediaUrls = post.content.match(/https:\/\/res\.cloudinary\.com\/[^"]+/g) || [];

        // Step 1: Delete associated comments
        db.query('DELETE FROM comments WHERE post_id = ?', [id], (err) => {
            if (err) {
                console.error('Database error deleting comments:', err);
                return res.status(500).json({ error: 'Database error deleting comments', details: err.message });
            }

            // Step 2: Delete associated likes
            db.query('DELETE FROM likes WHERE post_id = ?', [id], (err) => {
                if (err) {
                    console.error('Database error deleting likes:', err);
                    return res.status(500).json({ error: 'Database error deleting likes', details: err.message });
                }

                // Step 3: Delete Cloudinary media
                let mediaDeleteErrors = [];
                if (mediaUrls.length > 0) {
                    let completed = 0;
                    mediaUrls.forEach(url => {
                        const publicId = url.split('/').pop().split('.')[0];
                        cloudinary.uploader.destroy(publicId, { resource_type: 'image' }, (error, result) => {
                            if (error) {
                                console.error('Cloudinary delete error:', error);
                                mediaDeleteErrors.push({ publicId, error: error.message });
                            }
                            completed++;

                            // Step 4: Delete the post after all media deletions are attempted
                            if (completed === mediaUrls.length) {
                                deletePost();
                            }
                        });
                    });
                } else {
                    deletePost();
                }

                function deletePost() {
                    db.query('DELETE FROM posts WHERE id = ?', [id], (err) => {
                        if (err) {
                            console.error('Database error during post deletion:', err);
                            return res.status(500).json({ error: 'Database error', details: err.message });
                        }

                        if (mediaDeleteErrors.length > 0) {
                            return res.status(207).json({ 
                                message: 'Post and dependencies deleted, but some media failed to delete',
                                errors: mediaDeleteErrors 
                            });
                        }
                        res.json({ message: 'Post deleted successfully' });
                    });
                }
            });
        });
    });
});

// Get Analytics (Admin Only)
app.get('/admin/analytics', authMiddleware, adminMiddleware, (req, res) => {
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

    db.query(likesQuery, [req.user.id], (err, likes) => {
        if (err) {
            console.error('Likes query error:', err);
            return res.status(500).json({ error: 'Database error in likes query', details: err.message });
        }
        

        db.query(commentsQuery, [req.user.id], (err, comments) => {
            if (err) {
                console.error('Comments query error:', err);
                return res.status(500).json({ error: 'Database error in comments query', details: err.message });
            }
            res.json({ likes, comments });
        });
    });
});

// Helper function for like count
function getUpdatedLikeCount(postId, res) {
    db.query('SELECT COUNT(*) as count FROM likes WHERE post_id = ?', 
    [postId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error', details: err.message });
        res.json({ likes_count: results[0].count });
    });
}

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