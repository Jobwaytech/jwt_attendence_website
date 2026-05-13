# Responsive Authentication Website Full Stack

A modern full-stack authentication project with email/password login, real Gmail login through Google Identity Services, app-based two-factor authentication, an admin dashboard, and a responsive dark/light UI.

## Features

- Express backend with REST API routes
- Password hashing with bcrypt
- JWT-based admin sessions
- Real Google/Gmail login with backend ID-token verification
- App-based 2FA using QR codes and 6-digit authenticator codes
- Responsive Login and Register pages
- Admin-only dashboard at `/admin-dashboard`
- Searchable registered users table
- Delete user option protected by backend authorization
- Dark/light theme saved in localStorage

## Tech Stack

- Frontend: HTML5, CSS3, JavaScript, Vite
- Backend: Node.js, Express.js
- Auth: Google Identity Services, google-auth-library, bcryptjs, JSON Web Tokens
- 2FA: otplib, qrcode
- Storage: local JSON file in `data/users.json`

## Setup

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
copy .env.example .env
```

Open `.env` and set:

```txt
JWT_SECRET=replace-this-with-a-long-random-secret
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
ADMIN_EMAILS=yourgmail@gmail.com,admin@example.com
```

`ADMIN_EMAILS` controls which Gmail accounts are allowed into the admin dashboard.

## Create Google OAuth Client ID

1. Open Google Cloud Console.
2. Create or select a project.
3. Configure the OAuth consent screen.
4. Create an OAuth Client ID.
5. Choose `Web application`.
6. Add this authorized JavaScript origin for local development:

```txt
http://localhost:5173
```

7. Copy the Client ID into `GOOGLE_CLIENT_ID` in `.env`.

## Run In Development

Start backend and frontend together:

```bash
npm run dev
```

Open:

```txt
http://localhost:5173
```

The backend runs on:

```txt
http://localhost:5000
```

The Vite frontend proxies `/api` requests to the backend.

## Demo Email Login

The backend creates this admin automatically on first run:

```txt
Email: admin@example.com
Password: 123456
```

## 2FA Flow

1. Login as an admin.
2. Open the Admin Dashboard.
3. Click `Set up 2FA`.
4. Scan the QR code with Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.
5. Enter the 6-digit code to enable 2FA.
6. On the next login, the app asks for the authenticator code after password or Google login.

## Build And Run Production

Create the production frontend build:

```bash
npm run build
```

Run the Express backend and serve the built frontend:

```bash
npm run start
```

Open:

```txt
http://localhost:5000
```

## API Routes

- `GET /api/health` checks that the backend is running
- `GET /api/config` returns public frontend config
- `POST /api/register` creates a password user
- `POST /api/login` logs in with email and password
- `POST /api/google-login` verifies a Google ID token and logs in
- `POST /api/2fa/verify-login` completes login when 2FA is enabled
- `POST /api/2fa/setup` creates a QR code for the logged-in user
- `POST /api/2fa/enable` enables 2FA after a valid code
- `POST /api/2fa/disable` disables 2FA after a valid code
- `GET /api/me` returns the logged-in user
- `GET /api/users` returns all users, admin only
- `DELETE /api/users/:id` deletes a user, admin only

## Project Structure

```txt
Authentication/
|-- .env.example
|-- data/
|   `-- users.json
|-- index.html
|-- package.json
|-- README.md
|-- server.js
|-- vite.config.js
`-- src/
    |-- app.js
    `-- styles.css
```

`data/users.json` is created automatically and ignored by Git because it contains local user records and 2FA secrets.

## Security Note

This is suitable for a learning project. For production, use a real database, set a strong `JWT_SECRET`, use HTTPS, rate-limit login attempts, protect admin role assignment, and consider httpOnly secure cookies instead of localStorage tokens.
