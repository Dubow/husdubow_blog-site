document.addEventListener('DOMContentLoaded', () => {
    fetchPosts();
    checkAuthStatus();
    setupMobileMenu();
});

async function fetchPosts() {
    try {
        const response = await fetch('/api/posts');
        const posts = await response.json();
        renderPosts(posts);
    } catch (err) {
        console.error('Error loading posts:', err);
        document.getElementById('posts-container').innerHTML = 
            '<p class="error">Error loading posts. Please try again later.</p>';
    }
}

function renderPosts(posts) {
    const container = document.getElementById('posts-container');
    container.innerHTML = '';
    
    if (posts.length === 0) {
        container.innerHTML = '<p class="no-posts">No posts yet. Check back later!</p>';
        return;
    }
    
    posts.forEach(post => {
        const postEl = document.createElement('article');
        postEl.className = 'blog-post';
        const hasLiked = localStorage.getItem(`liked_${post.id}`) === 'true';
        const maxPreviewLength = 300;
        const fullContent = post.content;
        let previewContent = fullContent;
        if (fullContent.length > maxPreviewLength) {
            previewContent = fullContent.substring(0, maxPreviewLength) + '...';
        }
        
        postEl.innerHTML = `
            <h2 class="post-title">${post.title}</h2>
            <div class="post-meta">
                <span class="post-author">By ${post.author}</span>
                <span class="post-date">${new Date(post.created_at).toLocaleDateString()}</span>
            </div>
            <div class="post-content">
                <div class="post-excerpt" data-state="preview">${previewContent}</div>
                ${fullContent.length > maxPreviewLength ? 
                    `<a href="#" class="read-toggle" data-full="${encodeURIComponent(fullContent)}" data-preview="${encodeURIComponent(previewContent)}">Read More</a>` : 
                    fullContent.length > 0 ? 
                        `<a href="#" class="read-toggle" data-full="${encodeURIComponent(fullContent)}" data-preview="${encodeURIComponent(previewContent)}" style="display: none;">Read Less</a>` : 
                        ''
                }
            </div>
            <div class="post-actions">
                <div class="social-share">
                    <button class="share-btn" data-post-id="${post.id}">
                        <i class="fas fa-share"></i>
                    </button>
                    <div class="social-popup" id="social-popup-${post.id}">
                        <a href="#" class="share-twitter" data-url="${window.location.origin}" data-text="${post.title}">
                            <i class="fab fa-twitter"></i>
                        </a>
                        <a href="#" class="share-facebook" data-url="${window.location.origin}">
                            <i class="fab fa-facebook"></i>
                        </a>
                        <a href="#" class="share-whatsapp" data-url="${window.location.origin}" data-text="${post.title}">
                            <i class="fab fa-whatsapp"></i>
                        </a>
                        <a href="#" class="share-wechat" data-url="${window.location.origin}" data-text="${post.title}">
                            <i class="fab fa-wechat"></i>
                        </a>
                        <a href="#" class="share-linkedin" data-url="${window.location.origin}" data-text="${post.title}">
                            <i class="fab fa-linkedin"></i>
                        </a>
                    </div>
                </div>
                <div class="engagement">
                    <button class="like-btn ${hasLiked ? 'liked' : ''}" data-post-id="${post.id}">
                        <i class="${hasLiked ? 'fas' : 'far'} fa-heart"></i> 
                        <span class="like-count">${post.likes_count || 0}</span>
                    </button>
                    <button class="comment-btn" data-post-id="${post.id}">
                        <i class="far fa-comment"></i> <span class="comment-count">${post.comments_count || 0}</span>
                    </button>
                </div>
            </div>
            <div class="comments-section" id="comments-${post.id}" style="display: none;">
                <!-- Comments will be loaded here -->
            </div>
        `;
        container.appendChild(postEl);
    });
    
    setupEventListeners();
}

function setupEventListeners() {
    setupShareButtons();
    setupLikeButtons();
    setupCommentButtons();
    setupReadToggles();
}

function setupShareButtons() {
    document.querySelectorAll('.share-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const postId = btn.getAttribute('data-post-id');
            const popup = document.getElementById(`social-popup-${postId}`);
            popup.classList.toggle('active');
        });
    });

    document.querySelectorAll('.share-twitter').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = encodeURIComponent(btn.getAttribute('data-url'));
            const text = encodeURIComponent(btn.getAttribute('data-text'));
            window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
        });
    });
    
    document.querySelectorAll('.share-facebook').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = encodeURIComponent(btn.getAttribute('data-url'));
            window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
        });
    });

    document.querySelectorAll('.share-whatsapp').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = encodeURIComponent(btn.getAttribute('data-url'));
            const text = encodeURIComponent(btn.getAttribute('data-text'));
            window.open(`https://api.whatsapp.com/send?text=${text}%20${url}`, '_blank');
        });
    });

    document.querySelectorAll('.share-wechat').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            alert('WeChat sharing requires a QR code or app integration.');
        });
    });

    document.querySelectorAll('.share-linkedin').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const url = encodeURIComponent(btn.getAttribute('data-url'));
            const text = encodeURIComponent(btn.getAttribute('data-text'));
            window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${text}`, '_blank');
        });
    });

    document.addEventListener('click', (e) => {
        document.querySelectorAll('.social-popup.active').forEach(popup => {
            if (!popup.contains(e.target) && !e.target.closest('.share-btn')) {
                popup.classList.remove('active');
            }
        });
    });
}

function setupLikeButtons() {
    document.querySelectorAll('.like-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = btn.getAttribute('data-post-id');
            const token = localStorage.getItem('token');
            
            if (!token) {
                alert('Please login to like posts');
                window.location.href = '/login.html';
                return;
            }
            
            try {
                const response = await fetch(`/api/posts/${postId}/like`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                
                const result = await response.json();
                if (result.likes_count !== undefined) {
                    const countEl = btn.querySelector('.like-count');
                    countEl.textContent = result.likes_count;
                    const icon = btn.querySelector('i');
                    const isLiked = btn.classList.toggle('liked');
                    icon.classList.toggle('far');
                    icon.classList.toggle('fas');
                    localStorage.setItem(`liked_${postId}`, isLiked);
                }
            } catch (err) {
                console.error('Error liking post:', err);
            }
        });
    });
}

function setupCommentButtons() {
    document.querySelectorAll('.comment-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const postId = btn.getAttribute('data-post-id');
            const commentsSection = document.getElementById(`comments-${postId}`);
            
            if (commentsSection.style.display === 'none') {
                await loadComments(postId, commentsSection);
                commentsSection.style.display = 'block';
            } else {
                commentsSection.style.display = 'none';
            }
        });
    });
}

function setupReadToggles() {
    document.querySelectorAll('.read-toggle').forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            const postContent = toggle.closest('.post-content');
            if (!postContent) {
                console.error('Could not find post-content element for toggle:', toggle);
                return;
            }
            const excerpt = postContent.querySelector('.post-excerpt');
            if (!excerpt) {
                console.error('Could not find post-excerpt element within post-content for toggle:', toggle);
                return;
            }

            const fullContent = decodeURIComponent(toggle.getAttribute('data-full'));
            const previewContent = decodeURIComponent(toggle.getAttribute('data-preview'));

            if (excerpt.getAttribute('data-state') === 'preview') {
                excerpt.innerHTML = fullContent;
                excerpt.setAttribute('data-state', 'full');
                toggle.textContent = 'Read Less';
                toggle.style.display = 'inline';
            } else {
                excerpt.innerHTML = previewContent;
                excerpt.setAttribute('data-state', 'preview');
                toggle.textContent = 'Read More';
                toggle.style.display = 'inline';
            }
        });
    });
}

async function loadComments(postId, container) {
    try {
        const response = await fetch(`/api/posts/${postId}/comments`);
        const comments = await response.json();
        
        container.innerHTML = '';
        
        if (comments.length === 0) {
            container.innerHTML = '<p class="no-comments">No comments yet. Be the first to comment!</p>';
        } else {
            comments.forEach(comment => {
                const commentEl = document.createElement('div');
                commentEl.className = 'comment';
                commentEl.innerHTML = `
                    <div class="comment-author">${comment.username}</div>
                    <div class="comment-date">${new Date(comment.created_at).toLocaleString()}</div>
                    <div class="comment-text">${comment.content}</div>
                `;
                container.appendChild(commentEl);
            });
        }
        
        if (localStorage.getItem('token')) {
            const form = document.createElement('form');
            form.className = 'comment-form';
            form.innerHTML = `
                <textarea placeholder="Add a comment..." required></textarea>
                <button type="submit">Post Comment</button>
            `;
            
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const content = form.querySelector('textarea').value.trim();
                if (!content) return;
                
                try {
                    const response = await fetch(`/api/posts/${postId}/comments`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('token')}`
                        },
                        body: JSON.stringify({ content })
                    });
                    
                    const newComment = await response.json();
                    if (newComment.id) {
                        form.querySelector('textarea').value = '';
                        await loadComments(postId, container);
                        const countEl = document.querySelector(`.comment-btn[data-post-id="${postId}"] .comment-count`);
                        countEl.textContent = parseInt(countEl.textContent) + 1;
                    }
                } catch (err) {
                    console.error('Error posting comment:', err);
                }
            });
            
            container.appendChild(form);
        }
    } catch (err) {
        console.error('Error loading comments:', err);
        container.innerHTML = '<p class="error">Error loading comments</p>';
    }
}

function checkAuthStatus() {
    const token = localStorage.getItem('token');
    const authLinks = document.querySelector('.blog-header .auth-links');
    const mobileAuthLinks = document.querySelector('.mobile-auth-menu .auth-links');
    
    if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        
        authLinks.innerHTML = `
            ${payload.is_admin ? '<a href="/admin.html" class="btn">Admin Panel</a>' : ''}
            <button id="logout" class="btn">Logout</button>
        `;
        
        mobileAuthLinks.innerHTML = `
            ${payload.is_admin ? '<a href="/admin.html" class="btn">Admin Panel</a>' : ''}
            <button id="mobile-logout" class="btn"><i class="fas fa-sign-out-alt"></i> Logout</button>
        `;
        
        document.getElementById('logout').addEventListener('click', logout);
        document.getElementById('mobile-logout')?.addEventListener('click', logout);
    }
}

function logout() {
    localStorage.removeItem('token');
    window.location.href = '/';
}

function setupMobileMenu() {
    const menuToggle = document.querySelector('.menu-toggle');
    const mobileMenu = document.querySelector('.mobile-auth-menu');

    menuToggle.addEventListener('click', () => {
        mobileMenu.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!mobileMenu.contains(e.target) && !menuToggle.contains(e.target)) {
            mobileMenu.classList.remove('active');
        }
        
    });
}