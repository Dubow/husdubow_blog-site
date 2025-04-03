document.addEventListener('DOMContentLoaded', () => {
    // Common TinyMCE configuration
    const tinymceConfig = {
        height: 500,
        plugins: 'image media link lists',
        toolbar: 'undo redo | formatselect | bold italic | alignleft aligncenter alignright | bullist numlist | image media link',
        menubar: 'file edit view insert format tools table',
        content_style: 'body { font-family: Arial, sans-serif; font-size: 16px; }',
        images_upload_handler: async (blobInfo) => {
            try {
                const formData = new FormData();
                formData.append('file', blobInfo.blob(), blobInfo.filename());

                const response = await fetch('/admin/upload-media', {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    },
                    body: formData
                });

                if (!response.ok) {
                    throw new Error('Upload failed');
                }

                const data = await response.json();
                if (data.media_url) {
                    return data.media_url;
                } else {
                    throw new Error(data.error || 'Upload failed');
                }
            } catch (err) {
                console.error('Upload error:', err);
                throw new Error('Upload failed: ' + err.message);
            }
        }
    };

    // Initialize TinyMCE editors
    tinymce.init({ selector: '#content', ...tinymceConfig });
    tinymce.init({ selector: '#edit-content', ...tinymceConfig });

    // Navigation functionality
    const setupNavigation = () => {
        const navItems = document.querySelectorAll('.nav-item[data-section]');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.getAttribute('data-section');
                
                navItems.forEach(navItem => navItem.classList.remove('active'));
                item.classList.add('active');
                
                document.querySelectorAll('.content-section').forEach(section => {
                    section.style.display = 'none';
                });
                
                const sectionElement = document.getElementById(`${section}-section`);
                if (sectionElement) {
                    sectionElement.style.display = 'block';
                }
                
                if (section === 'home') {
                    loadPosts();
                } else if (section === 'analytics') {
                    loadAnalytics('day');
                }
            });
        });
    };

    // Check authentication
    const token = localStorage.getItem('token');
    if (token) {
        document.getElementById('login-section').style.display = 'none';
        document.getElementById('admin-dashboard').style.display = 'grid';
        setupNavigation();
        loadPosts();
    }

    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button');
        button.disabled = true;
        button.textContent = 'Logging in...';

        try {
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;

            const response = await fetch('/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await response.json();

            if (data.token) {
                localStorage.setItem('token', data.token);
                document.getElementById('login-section').style.display = 'none';
                document.getElementById('admin-dashboard').style.display = 'grid';
                setupNavigation();
                loadPosts();
            } else {
                alert(data.error || 'Login failed');
            }
        } catch (err) {
            alert('Login error: ' + err.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Login';
        }
    });

    // Upload Form
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button');
        button.disabled = true;
        button.textContent = 'Publishing...';

        try {
            const title = document.getElementById('title').value;
            const content = tinymce.get('content').getContent();

            const response = await fetch('/admin/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ title, content })
            });

            const data = await response.json();

            if (data.message) {
                alert('Post published successfully!');
                document.getElementById('title').value = '';
                tinymce.get('content').setContent('');
                await loadPosts();
                document.querySelector('.nav-item[data-section="home"]').click();
            } else {
                alert(data.error || 'Publish failed');
            }
        } catch (err) {
            alert('Publish error: ' + err.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Publish Post';
        }
    });

    // Edit Form
    document.getElementById('edit-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const button = e.target.querySelector('button');
        button.disabled = true;
        button.textContent = 'Updating...';

        try {
            const id = document.getElementById('edit-id').value;
            const title = document.getElementById('edit-title').value;
            const content = tinymce.get('edit-content').getContent();

            const response = await fetch(`/admin/posts/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ title, content })
            });

            const data = await response.json();

            if (data.message) {
                alert('Post updated successfully!');
                document.getElementById('edit-section').style.display = 'none';
                await loadPosts();
                document.querySelector('.nav-item[data-section="home"]').click();
            } else {
                alert(data.error || 'Update failed');
            }
        } catch (err) {
            alert('Update error: ' + err.message);
        } finally {
            button.disabled = false;
            button.textContent = 'Update Post';
        }
    });

    // Cancel Edit
    document.getElementById('cancel-edit').addEventListener('click', () => {
        document.getElementById('edit-section').style.display = 'none';
        document.querySelector('.nav-item[data-section="home"]').click();
    });

    // Analytics Period Change
    document.getElementById('analytics-period').addEventListener('change', (e) => {
        loadAnalytics(e.target.value);
    });

    // Logout with confirmation
    function confirmLogout() {
        if (confirm('Are you sure you want to log out? Any unsaved changes will be lost.')) {
            logout();
        }
    }

    document.getElementById('logout').addEventListener('click', confirmLogout);
    document.getElementById('mobile-logout').addEventListener('click', confirmLogout);

    function logout() {
        localStorage.removeItem('token');
        document.getElementById('admin-dashboard').style.display = 'none';
        document.getElementById('login-section').style.display = 'flex';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
    }
});

async function loadPosts() {
    try {
        const response = await fetch('/admin/posts', {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const posts = await response.json();

        const postList = document.getElementById('post-list');
        postList.innerHTML = '';

        if (posts.length === 0) {
            postList.innerHTML = '<p class="no-posts">You have no posts yet. Create your first post!</p>';
            return;
        }

        posts.forEach(post => {
            const postItem = document.createElement('div');
            postItem.className = 'post-item';

            const postContent = document.createElement('div');
            postContent.className = 'post-content';

            const title = document.createElement('h3');
            title.className = 'post-title';
            title.textContent = post.title;

            const excerpt = document.createElement('div');
            excerpt.className = 'post-excerpt';
            excerpt.setAttribute('data-state', 'preview');

            const maxPreviewLength = 300;
            const fullContent = post.content;
            let previewContent = fullContent;

            if (fullContent.length > maxPreviewLength) {
                previewContent = fullContent.substring(0, maxPreviewLength) + '...';
            }
            excerpt.innerHTML = previewContent;

            const toggle = document.createElement('a');
            toggle.href = '#';
            toggle.className = 'read-toggle';
            toggle.setAttribute('data-full', encodeURIComponent(fullContent));
            toggle.setAttribute('data-preview', encodeURIComponent(previewContent));
            toggle.textContent = fullContent.length > maxPreviewLength ? 'Read More' : 'Read Less';
            if (fullContent.length <= maxPreviewLength) {
                toggle.style.display = 'none';
            }

            postContent.appendChild(title);
            postContent.appendChild(excerpt);
            postContent.appendChild(toggle);

            const postActions = document.createElement('div');
            postActions.className = 'post-actions';
            postActions.innerHTML = `
                <button class="edit" onclick="editPost('${post.id}', '${encodeURIComponent(post.title)}', '${encodeURIComponent(post.content)}')">Edit</button>
                <button class="delete" onclick="deletePost('${post.id}')">Delete</button>
            `;

            postItem.appendChild(postContent);
            postItem.appendChild(postActions);
            postList.appendChild(postItem);

            toggle.addEventListener('click', (e) => {
                e.preventDefault();
                const excerptSibling = toggle.previousElementSibling;
                if (!excerptSibling || !excerptSibling.classList.contains('post-excerpt')) {
                    console.error('Could not find post-excerpt element for toggle:', toggle);
                    return;
                }

                const fullContent = decodeURIComponent(toggle.getAttribute('data-full'));
                const previewContent = decodeURIComponent(toggle.getAttribute('data-preview'));

                if (excerptSibling.getAttribute('data-state') === 'preview') {
                    excerptSibling.innerHTML = fullContent;
                    excerptSibling.setAttribute('data-state', 'full');
                    toggle.textContent = 'Read Less';
                    toggle.style.display = 'inline';
                } else {
                    excerptSibling.innerHTML = previewContent;
                    excerptSibling.setAttribute('data-state', 'preview');
                    toggle.textContent = 'Read More';
                    toggle.style.display = 'inline';
                }
            });
        });
    } catch (err) {
        console.error('Error loading posts:', err);
        document.getElementById('post-list').innerHTML = '<p class="error">Error loading posts. Please try again.</p>';
    }
}

function editPost(id, title, content) {
    try {
        const decodedTitle = decodeURIComponent(title);
        const decodedContent = decodeURIComponent(content);

        document.getElementById('edit-id').value = id;
        document.getElementById('edit-title').value = decodedTitle;

        const editor = tinymce.get('edit-content');
        if (editor) {
            editor.setContent(decodedContent);
        } else {
            console.error('TinyMCE editor for edit-content not initialized');
            alert('Editor not ready. Please try again.');
            return;
        }

        document.querySelectorAll('.content-section').forEach(section => {
            section.style.display = 'none';
        });

        document.getElementById('edit-section').style.display = 'block';

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
    } catch (err) {
        console.error('Error in editPost:', err);
        alert('Failed to load post for editing: ' + err.message);
    }
}

async function deletePost(id) {
    if (confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
        try {
            const response = await fetch(`/admin/posts/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            const data = await response.json();

            if (data.message) {
                alert('Post deleted successfully!');
                loadPosts();
            } else {
                alert(data.error || 'Delete failed');
            }
        } catch (err) {
            alert('Delete error: ' + err.message);
        }
    }
}

let chartInstance = null;

async function loadAnalytics(period) {
    try {
        const response = await fetch(`/admin/analytics?period=${period}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // Validate that data.likes and data.comments are arrays
        if (!Array.isArray(data.likes) || !Array.isArray(data.comments)) {
            throw new Error('Invalid analytics data: likes or comments is not an array');
        }

        const ctx = document.getElementById('analytics-chart').getContext('2d');

        if (chartInstance) {
            chartInstance.destroy();
        }

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.likes.map(item => item.period),
                datasets: [
                    {
                        label: 'Likes',
                        data: data.likes.map(item => item.count),
                        borderColor: '#1da1f2',
                        backgroundColor: 'rgba(29, 161, 242, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Comments',
                        data: data.comments.map(item => item.count),
                        borderColor: '#17bf63',
                        backgroundColor: 'rgba(23, 191, 99, 0.1)',
                        borderWidth: 2,
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { 
                        title: { display: true, text: period.charAt(0).toUpperCase() + period.slice(1) },
                        grid: { display: false }
                    },
                    y: { 
                        title: { display: true, text: 'Count' },
                        beginAtZero: true,
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    }
                }
            }
        });
    } catch (err) {
        console.error('Error loading analytics:', err);
        const chartContainer = document.getElementById('analytics-chart');
        chartContainer.innerHTML = `<p class="error">Error loading analytics data: ${err.message}</p>`;
    }
}