# Deployment Guide

This project is split into:

- Backend API: Express app in `backend`.
- Frontend: Next.js app in `frontend`.
- Database: MongoDB, recommended on MongoDB Atlas.

## Recommended Hosting

- Backend: Render Web Service
- Frontend: Vercel
- Database: MongoDB Atlas

## 1. MongoDB Atlas

Create a MongoDB Atlas cluster and copy the connection string.

Use it as:

```env
MONGODB_URI=mongodb+srv://...
```

Allow network access for your backend host. During setup you can temporarily allow `0.0.0.0/0`, then tighten it later if your host supports stable outbound IPs.

## 2. Backend on Render

Create a Render Web Service using the `backend` directory.

Settings:

```text
Root Directory: backend
Build Command: npm install
Start Command: npm start
Health Check Path: /api/health
```

Environment variables:

```env
PORT=10000
USE_HTTPS=false
JWT_SECRET=replace-with-a-long-random-secret
MONGODB_URI=mongodb+srv://...
ALLOWED_ORIGINS=https://your-vercel-app.vercel.app
ADMIN_EMAILS=your-admin@email.com,superadmin@example.com
ADMIN_OTP_RECIPIENTS=yarasanilikhithreddy08@gmail.com,jobwaytech@gmail.com,mdjobwaytech@gmail.com
BRANCH_ADMIN_OTP_RECIPIENTS=mplbranch.jwt@gmail.com
COMPANY_LATITUDE=17.4486
COMPANY_LONGITUDE=78.3908
ATTENDANCE_LOCATION_RADIUS_METERS=150
FACE_MATCH_THRESHOLD=85
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
MAIL_FROM=your-email@gmail.com
```

After deployment, confirm:

```text
https://your-render-service.onrender.com/api/health
```

## 3. Frontend on Vercel

Create a Vercel project using the `frontend` directory.

Settings:

```text
Root Directory: frontend
Framework Preset: Next.js
Build Command: npm run build
```

Environment variables:

```env
API_BASE_URL=https://your-render-service.onrender.com
```

Redeploy after adding environment variables.

## 4. Final Live Test

Test these flows on the live Vercel URL:

- Login as super admin.
- Create a user.
- Login as employee/student.
- Dashboard loads without console/API errors.
- Attendance pages load.
- Leave/task/calendar/report pages load.
- Password reset behavior works with SMTP configured.

## Notes

- Do not commit `.env`.
- Use a strong `JWT_SECRET`.
- Keep `USE_HTTPS=false` on Render. Render provides HTTPS at the platform edge.
- Add your final Vercel domain to `ALLOWED_ORIGINS` on the backend.
