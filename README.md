# HUSDUBOW_BLOG

##### A blogging platform for Dr. Hussein Dubow, an ENT specialist, to share thoughts, stories, and ideas. The application allows users to read posts, like and comment on them, and includes an admin panel for Dr. Dubow to manage content. The project is built with Node.js, Express, and MySQL, hosted on Heroku with the database on Aiven MySQL, and uses Cloudinary for media uploads.

# Table of Contents

##### Features (#features)
##### Tech Stack (#tech-stack)
##### Prerequisites (#prerequisites)
##### Installation (#installation)
##### Usage (#usage)
##### Deployment (#deployment)
##### Troubleshooting (#troubleshooting)
##### License (#license)

## Features
### Public Blog:
View all posts with like and comment counts.
Read post details with comments.
Like or unlike posts (authenticated users only).
Add comments to posts (authenticated users only).

### User Authentication:
Sign up and log in with username and password.
JWT-based authentication for secure access.

### Admin Panel:
Create, edit, and delete posts (admin only).
Upload media via Cloudinary (admin only).
View analytics (likes and comments over time).

### Responsive Design:
Mobile-friendly layout with a sticky footer when no posts are available.
Clean, modern UI with hover effects and animations.

### Deployment:
Hosted on Heroku with MySQL database on Aiven.
SSL enabled for secure connections.

##Tech Stack
Backend: Node.js, Express.js
Database: MySQL (hosted on Aiven)
Frontend: HTML, CSS, JavaScript
Authentication: JWT (jsonwebtoken), bcryptjs for password hashing
Media Storage: Cloudinary
Deployment: Heroku
Dependencies:
           express: Web framework
           mysql2: MySQL client
           dotenv: Environment variable management
           jsonwebtoken: JWT authentication
           bcryptjs: Password hashing
           cloudinary: Media upload and management
           multer: File upload handling
           nodemon: Development server (dev dependency)

##Prerequisites
Node.js: v18.x or higher
MySQL: A MySQL database (local or hosted, e.g., on Aiven)
Heroku Account: For deployment
Cloudinary Account: For media uploads
Git: For version control
Heroku CLI: For deploying to Heroku

##  Installation
1: Clone the Repository:
![image](https://github.com/user-attachments/assets/3347d7a3-b8f4-4504-a350-b5e5355857a0)


Install Dependencies:
bash

npm install
