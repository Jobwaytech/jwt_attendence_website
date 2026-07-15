# Render Deployment Guide

Deploy this repository entirely on Render using two Web Services and MongoDB
Atlas:

- `authflow-api`: Express backend from `backend/`
- `authflow-frontend`: Next.js frontend from `frontend/`
- MongoDB Atlas: application database

## 1. MongoDB Atlas

Create a MongoDB Atlas cluster and copy its connection string:

```env
MONGODB_URI=mongodb+srv://...
```

Allow network access from Render. Restrict the Atlas network rules when a
stable outbound address is available.

## 2. Backend Render Web Service

Create a Render **Web Service** connected to this repository.

```text
Name: authflow-api
Root Directory: backend
Runtime: Node
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Set these environment variables:

```env
NODE_ENV=production
USE_HTTPS=false
JWT_SECRET=replace-with-a-long-random-secret
MONGODB_URI=mongodb+srv://...
ALLOWED_ORIGINS=https://authflow-frontend.onrender.com
ADMIN_EMAILS=your-admin@email.com
BRANCH_ADMIN_EMAILS=your-branch-admin@email.com
PORTAL_ADMIN_PASSWORD=replace-with-a-strong-password
PORTAL_BRANCH_ADMIN_PASSWORD=replace-with-a-strong-password
COMPANY_LATITUDE=17.4486
COMPANY_LONGITUDE=78.3908
ATTENDANCE_LOCATION_RADIUS_METERS=150
FACE_MATCH_THRESHOLD=85
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Render supplies `PORT`; do not set a fixed production port. Keep
`USE_HTTPS=false` because Render terminates HTTPS before forwarding traffic to
the Node service.

For durable JSON session records, attach a Render persistent disk at
`/var/data` and set:

```env
DATA_DIR=/var/data/authflow
```

For uploaded files, configure Cloudinary:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_UPLOAD_PRESET=your-upload-preset
```

After deployment, verify:

```text
https://authflow-api.onrender.com/api/health
```

## 3. Frontend Render Web Service

Create a second Render **Web Service** from the same repository.

```text
Name: authflow-frontend
Root Directory: frontend
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm start
Health Check Path: /
```

Set:

```env
NODE_ENV=production
API_BASE_URL=https://authflow-api.onrender.com
```

Replace the example service names with the actual Render URLs. Update the
backend `ALLOWED_ORIGINS` value whenever the frontend Render URL changes, then
redeploy both services.

## 4. Final Live Test

On the frontend Render URL, verify:

- Super Admin and Branch Admin login
- Employee and Student login
- User and branch management
- Attendance camera and location permissions
- Leave and regularization approval flows
- Task assignment and employee task updates
- Calendar events
- Payroll and payslip downloads
- PDF and CSV report exports
- Logout and session revocation

## Render Notes

- Do not commit `.env` files.
- Use a strong `JWT_SECRET` and administrator passwords.
- MongoDB Atlas is the primary database.
- Use a persistent Render disk for JSON session data.
- Free Render services can sleep, so the first request after inactivity may be
  slower.
