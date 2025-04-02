document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('token');
    if (token) {
        showUploadSection();
    }

    // Login Form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
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
            showUploadSection();
        } else {
            alert(data.error || 'Login failed');
        }
    });

    // Upload Form
    document.getElementById('upload-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('title').value;
        const content = document.getElementById('content').value;
        const type = document.getElementById('type').value;
        const file = document.getElementById('file').files[0];

        const formData = new FormData();
        formData.append('title', title);
        formData.append('content', content);
        formData.append('type', type);
        formData.append('file', file);

        const response = await fetch('/admin/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
            body: formData
        });
        const data = await response.json();

        if (data.message) {
            alert('Post uploaded successfully!');
            document.getElementById('upload-form').reset();
        } else {
            alert(data.error || 'Upload failed');
        }
    });

    // Logout
    document.getElementById('logout').addEventListener('click', () => {
        localStorage.removeItem('token');
        showLoginSection();
    });
});

function showUploadSection() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('upload-section').style.display = 'block';
}

function showLoginSection() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('upload-section').style.display = 'none';
}