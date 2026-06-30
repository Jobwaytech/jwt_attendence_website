# AuthFlow Employee and Student Management Portal

This project now implements phase two of the portal: secure authentication, role-based access control, branch management, employee attendance, leave management, task management, calendar management, and monthly reports.

## What Is Included

- Next.js frontend in `frontend/`
- Node.js + Express REST API in `backend/`
- JWT login sessions with server-side session records
- bcrypt password hashing before storage
- RBAC roles: Super Admin, Branch Admin, Employee, Student
- Separate role-aware login flow
- Forgot password and reset-token API for demo/testing
- Multi-branch CRUD and branch-wise reports
- Branch employee and branch student assignment tables
- Employee and student attendance with camera capture, face-signature matching, duplicate attendance prevention, GPS clock-in/out validation, device capture, and invalid attendance reasons
- Leave applications with Super Admin or Branch Admin approve/reject workflow
- Team/group creation with group-wise and individual task assignment, priorities, deadlines, progress updates, remarks, and status history
- Calendar management for company holidays, branch-wise holidays, employee/student events, training schedules, exam schedules, meeting reminders, birthday wishes, and upcoming notifications
- Payroll processing with salary, deductions, bonuses, net pay, salary history, and PDF payslip download
- Attendance regularization requests with Employee to Branch Admin to Super Admin approval flow
- Monthly attendance, task completion, payroll, leave, student, and employee performance reports
- Monthly report export endpoints for PDF and Excel-compatible CSV downloads
- JSON-backed demo database in `backend/data/`

## Employee 3 Remaining Work

The remaining work for Employee 3 includes completing the full Employee and Student Management Portal with all assigned modules: super admin login, branch admin login, employee login, and student login, along with JWT authentication, RBAC, password encryption, forgot password, and session management. Multi-branch management must include adding, editing, and deleting branches, storing branch name, branch code, address, manager, and contact details, and allocating employees and students branch-wise using branches, branch_employees, and branch_students tables. The employee portal must include face authentication attendance with clock in, clock out, date and time capture, attendance history, face match, duplicate face prevention, camera verification, and also precise login/logout location tracking where both locations must match or be within the allowed range, otherwise the user should be marked absent. Leave management must include casual leave, sick leave, permission requests, leave application form, status tracking, and Super Admin or Branch Admin approval or rejection. Task management must include team/group creation first, then assigning tasks group-wise or employee-wise, with daily task assignment, status update, priority, deadlines, remarks, and task status types like Pending, In Progress, Completed, Hold, and Rejected using tasks, task_assignments, and task_status tables. Monthly reports must include attendance report, task completion report, performance report, PDF export, and Excel export. Calendar management must include company holidays, employee events, meeting reminders, branch-wise holidays, event scheduler, notifications, and birthday popup wishes using DOB from registration. Payroll and payslip system must include salary details, monthly payslip generation, PDF payslip download, salary history, employee name, employee ID, branch, salary, deductions, net pay, payroll table, and salary_slips table. Attendance regularization must include attendance correction request, missing attendance request, shift adjustment request, and approval flow from Employee to Branch Admin to Super Admin. Final pending work also includes full backend/database connection, API integration, validations, responsive UI fixes, testing, debugging, and deployment.

## Demo Accounts

All demo accounts use:

```txt
Password: 123456
```

```txt
Super Admin:  superadmin@example.com
Branch Admin: branchadmin@example.com
Employee:     employee@example.com
Student:      student@example.com
```

Existing seeded accounts use only the four current RBAC roles.

## Tech Stack

- Frontend: Next.js, React, TypeScript, CSS, lucide-react
- Backend: Node.js, Express.js
- Auth: bcryptjs, JSON Web Tokens, google-auth-library
- Storage: local JSON files under `backend/data/`

## Database Files

```txt
backend/data/users.json
backend/data/branches.json
backend/data/branch-employees.json
backend/data/branch-students.json
backend/data/employees.json
backend/data/students.json
backend/data/attendance.json
backend/data/face-profiles.json
backend/data/leaves.json
backend/data/tasks.json
backend/data/task-assignments.json
backend/data/task-status.json
backend/data/teams.json
backend/data/team-members.json
backend/data/calendar-events.json
backend/data/birthday-notifications.json
backend/data/payroll.json
backend/data/salary-slips.json
backend/data/reports.json
backend/data/attendance-regularization.json
backend/data/sessions.json
backend/data/reset-tokens.json
backend/data/notifications.json
```

These act as separate demo tables for this phase. For production, replace them with a real database.

## Setup

Install root dependencies:

```bash
npm install
```

Install backend dependencies:

```bash
npm --prefix backend install
```

Install Next.js app dependencies:

```bash
npm --prefix frontend install
```

Create your environment file:

```bash
copy backend\.env.example backend\.env
```

Set these values in `backend/.env`:

```txt
JWT_SECRET=replace-this-with-a-long-random-secret
MONGODB_URI=mongodb://127.0.0.1:27017/authflow
GOOGLE_CLIENT_ID=your-google-oauth-web-client-id.apps.googleusercontent.com
ADMIN_EMAILS=yourgmail@gmail.com,superadmin@example.com
```

## MongoDB API Layer

The Express server connects to MongoDB with Mongoose when `MONGODB_URI` is set. Seed data is created automatically for testing.

Protected CRUD endpoints are available at:

```txt
/api/mongodb/users
/api/mongodb/branches
/api/mongodb/attendance
/api/mongodb/leaves
/api/mongodb/tasks
/api/mongodb/payroll
/api/mongodb/calendar
/api/mongodb/reports
```

All routes keep the existing JWT middleware. Super Admin can manage all MongoDB resources; Branch Admin has manager-scoped access; Employee and Student access is read-limited where applicable.

## Run In Development

Start the Express backend and Next.js frontend together:

```bash
npm run dev
```

Open:

```txt
https://localhost:3000
https://192.168.1.12:3000
```

The backend runs on:

```txt
https://localhost:5000
```

The Next.js config rewrites `/api/...` requests to a local-only API proxy at `http://127.0.0.1:5001/api/...` while the browser-facing app and backend both run on HTTPS.
If port `5000` is busy, start the backend on another port by setting `API_PORT=5010`.

## Useful Scripts

```bash
npm run dev
npm run server
npm run client
npm run build
```

## Main API Routes

- `POST /api/login`
- `POST /api/logout`
- `POST /api/register`
- `POST /api/forgot-password`
- `POST /api/reset-password`
- `GET /api/me`
- `GET /api/users`
- `DELETE /api/users/:id`
- `GET /api/branches`
- `POST /api/branches`
- `PUT /api/branches/:id`
- `DELETE /api/branches/:id`
- `GET /api/reports/branches`
- `POST /api/attendance/clock-in`
- `POST /api/attendance/clock-out`
- `GET /api/attendance`
- `POST /api/leaves`
- `GET /api/leaves`
- `PUT /api/leaves/:id/status`
- `GET /api/teams`
- `POST /api/teams`
- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:assignmentId/status`
- `GET /api/calendar/events`
- `POST /api/calendar/events`
- `DELETE /api/calendar/events/:id`
- `GET /api/payroll`
- `POST /api/payroll/process`
- `GET /api/payroll/:id/payslip`
- `GET /api/attendance-regularization`
- `POST /api/attendance-regularization`
- `PUT /api/attendance-regularization/:id/status`
- `GET /api/reports/monthly`
- `GET /api/reports/monthly/export?format=pdf|excel`
- `GET /api/notifications`
- `GET /api/sessions`

## Security Note

This is a strong learning/demo foundation. Before production, move JSON storage to a database, store JWTs in secure httpOnly cookies, add rate limiting and audit logs, use HTTPS, and replace the demo camera signature with a real face recognition pipeline such as face-api.js, MediaPipe, or OpenCV embeddings.
