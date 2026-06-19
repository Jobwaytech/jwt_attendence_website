"use client";

import {
  CalendarCheck,
  CalendarDays,
  Camera,
  Check,
  ClipboardList,
  Download,
  Eye,
  EyeOff,
  FileBarChart,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "../services/api";
import { browserFingerprint, captureFaceSample, clockAttendance, deviceInfo, nextFaceSampleLabel, registerFaceProfile, runLivenessChallenge, type FaceSample } from "../services/faceVerification";

type StudentRoute = "login" | "dashboard" | "profile" | "attendance" | "tasks" | "leaves" | "reports" | "calendar";
type Theme = "light" | "dark";
type TaskStatus = "pending" | "in_progress" | "completed" | "hold" | "rejected";
type Priority = "low" | "medium" | "high" | "urgent";
type LeaveStatus = "pending" | "approved" | "rejected";
type RegularizationType = "missing_clock_in" | "missing_clock_out" | "attendance_correction" | "late_entry";

type StudentUser = {
  id: string;
  studentId: string;
  name: string;
  email: string;
  role: "student";
  phone?: string;
  branchId?: string;
  dob?: string;
  profile?: string;
  createdAt?: string;
};

type AttendanceRecord = {
  _id?: string;
  id?: string;
  userId: string;
  date: string;
  clockInAt?: string;
  clockOutAt?: string;
  status?: "present" | "absent" | "invalid";
  invalidReason?: string;
  matchScore?: number;
  faceVerified?: boolean;
  gpsVerified?: boolean;
  livenessVerified?: boolean;
  distanceFromOffice?: number;
  locationDistanceMeters?: number;
  securityWarning?: string;
};

type StudentLeave = {
  _id?: string;
  id?: string;
  leaveType: "casual" | "sick" | "permission";
  fromDate: string;
  toDate: string;
  reason: string;
  status: LeaveStatus;
  createdAt?: string;
};

type StudentTask = {
  id: string;
  assignmentId: string;
  title: string;
  description: string;
  category: "Daily Assignment" | "Internship Task";
  deadline: string;
  status: TaskStatus;
  priority: Priority;
  remarks: string;
  submittedAt?: string;
  teamName?: string;
};

type StudentEvent = {
  _id?: string;
  id?: string;
  title: string;
  type: string;
  startDate: string;
  endDate?: string;
  description?: string;
};

type FaceStatus = {
  registered: boolean;
  registeredAt?: string;
  updatedAt?: string;
  samples: number;
};

type Regularization = {
  _id?: string;
  id?: string;
  type: RegularizationType;
  date: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
  status: LeaveStatus;
  createdAt?: string;
};

type Workspace = {
  student: StudentUser | null;
  attendances: AttendanceRecord[];
  leaves: StudentLeave[];
  tasks: StudentTask[];
  calendars: StudentEvent[];
  regularizations: Regularization[];
  faceProfile: FaceStatus;
};

const TOKEN_KEY = "authflow_next_token";
const SESSION_KEY = "authflow_next_user";
const THEME_KEY = "authflow_next_theme";

const ROUTES: Record<Exclude<StudentRoute, "login">, string> = {
  dashboard: "/student-dashboard",
  profile: "/student-profile",
  attendance: "/student-attendance",
  tasks: "/student-tasks",
  leaves: "/student-leaves",
  reports: "/student-reports",
  calendar: "/student-calendar",
};

const emptyLeave = { leaveType: "casual" as StudentLeave["leaveType"], fromDate: "", toDate: "", reason: "" };
const emptyRegularization = { type: "missing_clock_in" as RegularizationType, date: "", requestedClockIn: "", requestedClockOut: "", reason: "" };

function initials(name?: string | null) {
  const safeName = String(name || "").trim();
  if (!safeName) return "NA";
  return safeName.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function displayName(name?: string | null) {
  return String(name || "").trim() || "Unknown User";
}

function firstName(name?: string | null) {
  return displayName(name).split(" ")[0];
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function percent(value: number, total: number) {
  return total ? Math.round((value / total) * 100) : 0;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function StudentPortal({ route }: { route: StudentRoute }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: "student@example.com", password: "123456" });
  const [session, setSession] = useState<StudentUser | null>(null);
  const [workspace, setWorkspace] = useState<Workspace>({ student: null, attendances: [], leaves: [], tasks: [], calendars: [], regularizations: [], faceProfile: { registered: false, samples: 0 } });
  const [leaveForm, setLeaveForm] = useState(emptyLeave);
  const [regularizationForm, setRegularizationForm] = useState(emptyRegularization);
  const [cameraOn, setCameraOn] = useState(false);
  const [faceSamples, setFaceSamples] = useState<FaceSample[]>([]);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [livenessPrompt, setLivenessPrompt] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const savedTheme = (localStorage.getItem(THEME_KEY) as Theme | null) || "light";
    document.documentElement.dataset.theme = savedTheme;
    setTheme(savedTheme);
    const savedSession = localStorage.getItem(SESSION_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (savedSession && token) {
      const user = JSON.parse(savedSession) as StudentUser;
      if (user.role === "student") {
        setSession(user);
        void loadWorkspace();
      }
    }
    setLoading(false);
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (route !== "login" && !session) window.location.replace("/student-login");
    if (route === "login" && session?.role === "student") window.location.replace("/student-dashboard");
  }, [loading, route, session]);

  const student = workspace.student || session;
  const summary = useMemo(() => {
    const present = workspace.attendances.filter((item) => item.status === "present").length;
    const absent = workspace.attendances.filter((item) => item.status === "absent" || item.status === "invalid").length;
    const completed = workspace.tasks.filter((item) => item.status === "completed").length;
    return {
      present,
      absent,
      workingDays: workspace.attendances.length,
      attendancePercentage: percent(present, workspace.attendances.length),
      pendingTasks: workspace.tasks.filter((item) => item.status !== "completed").length,
      completedTasks: completed,
      taskCompletion: percent(completed, workspace.tasks.length),
      leaveRequests: workspace.leaves.length,
      upcomingEvents: workspace.calendars.filter((item) => item.startDate >= today()).length,
      faceVerified: workspace.attendances.filter((item) => item.faceVerified).length,
      gpsVerified: workspace.attendances.filter((item) => item.gpsVerified).length,
    };
  }, [workspace]);

  function toast(message: string, isError = false) {
    setNotice(message);
    setError(isError ? message : "");
    window.setTimeout(() => setNotice(""), 2800);
  }

  async function loadWorkspace() {
    try {
      setWorkspaceLoading(true);
      const data = await apiRequest<Workspace>("/api/student/workspace");
      setWorkspace(data);
      setSession(data.student);
      if (data.student) localStorage.setItem(SESSION_KEY, JSON.stringify(data.student));
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Unable to load student workspace.", true);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await apiRequest<{ token?: string; user?: StudentUser; message?: string }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ ...loginForm, role: "student" }),
      });
      if (!result.token || !result.user || result.user.role !== "student") throw new Error("Student login failed.");
      localStorage.setItem(TOKEN_KEY, result.token);
      localStorage.setItem(SESSION_KEY, JSON.stringify(result.user));
      setSession(result.user);
      await loadWorkspace();
      window.location.href = "/student-dashboard";
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Student login failed.", true);
    }
  }

  function logout() {
    stopCamera();
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    window.location.href = "/student-login";
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
  }

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraOn(true);
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
      toast("Camera started.");
    } catch {
      toast("Camera permission is required.", true);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function captureFaceRegistrationSample() {
    if (!videoRef.current || !cameraOn) {
      toast("Start camera before capturing face samples.", true);
      return;
    }
    try {
      setVerificationBusy(true);
      const sample = await captureFaceSample(videoRef.current, nextFaceSampleLabel(faceSamples.length));
      setFaceSamples([...faceSamples, sample].slice(0, 10));
      toast(`Captured ${sample.label} sample.`);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Unable to capture face sample.", true);
    } finally {
      setVerificationBusy(false);
    }
  }

  async function saveFaceRegistration() {
    if (!student?.id || faceSamples.length < 3) {
      toast("Capture at least 3 face samples.", true);
      return;
    }
    try {
      setVerificationBusy(true);
      await registerFaceProfile(student.id, faceSamples);
      setFaceSamples([]);
      await loadWorkspace();
      toast("Face registration successful.");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Unable to register face.", true);
    } finally {
      setVerificationBusy(false);
    }
  }

  async function clock(type: "clockin" | "clockout") {
    if (!videoRef.current || !cameraOn || !student?.id) {
      toast("Start camera before marking attendance.", true);
      return;
    }
    try {
      setVerificationBusy(true);
      const liveness = await runLivenessChallenge(videoRef.current, setLivenessPrompt);
      const sample = await captureFaceSample(videoRef.current, "live");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 12000 }));
      const result = await clockAttendance(type, {
        userId: student.id,
        imageData: sample.imageData,
        embedding: sample.vector,
        livenessChallenge: liveness.challenge,
        livenessVerified: liveness.livenessVerified,
        gps: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          address: `GPS ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
          capturedAt: new Date().toISOString(),
        },
        browserFingerprint: await browserFingerprint(),
        deviceInfo: deviceInfo(),
      });
      await loadWorkspace();
      toast(result.approved ? (type === "clockin" ? "Clock in recorded." : "Clock out recorded.") : result.message, !result.approved);
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Attendance verification failed.", true);
    } finally {
      setVerificationBusy(false);
      setLivenessPrompt("");
    }
  }

  async function applyLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest("/api/student/leaves", { method: "POST", body: JSON.stringify(leaveForm) });
      setLeaveForm(emptyLeave);
      await loadWorkspace();
      toast("Leave request submitted.");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Unable to submit leave.", true);
    }
  }

  async function submitRegularization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await apiRequest("/api/student/regularizations", { method: "POST", body: JSON.stringify(regularizationForm) });
      setRegularizationForm(emptyRegularization);
      await loadWorkspace();
      toast("Regularization request submitted.");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Unable to submit request.", true);
    }
  }

  async function updateTask(task: StudentTask, status: TaskStatus, remarks: string) {
    try {
      await apiRequest(`/api/student/tasks/${task.id}/assignments/${task.assignmentId}`, {
        method: "PUT",
        body: JSON.stringify({ status, remarks, progress: status === "completed" ? 100 : undefined }),
      });
      await loadWorkspace();
      toast("Task updated.");
    } catch (caught) {
      toast(caught instanceof Error ? caught.message : "Unable to update task.", true);
    }
  }

  function exportReport(format: "pdf" | "excel") {
    if (!student) return;
    const rows = [
      ["JOB WAY TECH CONSULTANT & TRAINING"],
      ["Student Report", student.name, student.studentId],
      ["Attendance %", summary.attendancePercentage],
      ["Present", summary.present],
      ["Absent", summary.absent],
      ["Completed Tasks", summary.completedTasks],
      ["Pending Tasks", summary.pendingTasks],
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
    downloadBlob(`student-report-${student.studentId}.${format === "pdf" ? "pdf" : "csv"}`, csv, format === "pdf" ? "application/pdf" : "text/csv");
    toast(`${format === "pdf" ? "PDF" : "Excel"} export generated.`);
  }

  if (loading) return <main className="loading-screen"><div className="brand-mark logo-mark"><Image className="brand-logo" src="/assets/job-way-tech-logo.png" alt="JobWayTech logo" width={44} height={44} priority /></div><p>Preparing student portal...</p></main>;

  if (route === "login") {
    return (
      <main className="auth-page">
        <section className="auth-visual student-visual" aria-label="Student portal overview">
          <div className="brand-row"><div className="brand-mark logo-mark"><Image className="brand-logo" src="/assets/job-way-tech-logo.png" alt="JobWayTech logo" width={44} height={44} priority /></div><div><strong>JobWayTech</strong><span>Student Login Portal</span></div></div>
          <div className="welcome-copy"><span className="eyebrow"><ShieldCheck /> Student access</span><h1>Track attendance, tasks, leaves, reports, and schedules.</h1><p>A dedicated student workspace with JWT, RBAC, and MongoDB data.</p></div>
          <div className="floating-grid"><article><Camera /><strong>Face Attendance</strong><span>Face, GPS, liveness</span></article><article><ClipboardList /><strong>Tasks</strong><span>Daily and internship work</span></article><article><CalendarDays /><strong>Calendar</strong><span>Events and training</span></article></div>
        </section>
        <section className="auth-card">
          <div className="section-title"><UserRound /><div><h2>Student login</h2><p>Role is fixed to student for this portal.</p></div></div>
          <form className="form" onSubmit={handleLogin}>
            <label>Email address<input type="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} required /></label>
            <label>Password<div className="password-input"><input type={showPassword ? "text" : "password"} value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} required /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Toggle password">{showPassword ? <EyeOff /> : <Eye />}</button></div></label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" type="submit">Open student dashboard</button>
          </form>
          <p className="demo-note">Demo student: student@example.com / 123456.</p>
        </section>
        {notice ? <div className={`toast ${error === notice ? "error" : ""}`}>{notice}</div> : null}
      </main>
    );
  }

  if (!student) return <main className="loading-screen"><p>Redirecting...</p></main>;

  const navItems = [
    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { id: "profile" as const, label: "Profile", icon: UserRound },
    { id: "attendance" as const, label: "Attendance", icon: Camera },
    { id: "tasks" as const, label: "Tasks", icon: ClipboardList },
    { id: "leaves" as const, label: "Leaves", icon: CalendarCheck },
    { id: "reports" as const, label: "Reports", icon: FileSpreadsheet },
    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
  ];

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand-row"><div className="brand-mark logo-mark"><Image className="brand-logo" src="/assets/job-way-tech-logo.png" alt="JobWayTech logo" width={44} height={44} priority /></div><div><strong>JobWayTech</strong><span>Student Portal</span></div></div>
        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={route === item.id ? "active" : ""} onClick={() => { window.location.href = ROUTES[item.id]; }}><Icon />{item.label}</button>;
          })}
          <button onClick={logout}><LogOut />Logout</button>
        </nav>
        <div className="sidebar-card"><ShieldCheck /><strong>Student scope</strong><span>JWT and RBAC protect student-only pages.</span></div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button className="icon-button mobile-only" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle menu">{menuOpen ? <X /> : <Menu />}</button>
          <div className="profile-strip"><div className="avatar">{initials(displayName(student.name))}</div><div><strong>{displayName(student.name)}</strong><span>{student.email}</span></div></div>
          <div className="top-actions"><button className="icon-button" onClick={toggleTheme} aria-label="Toggle theme">{theme === "dark" ? <Sun /> : <Moon />}</button><button className="ghost-button" onClick={logout}><LogOut /> Logout</button></div>
        </header>

        {workspaceLoading ? <p className="demo-note">Loading MongoDB student workspace...</p> : null}
        {route === "dashboard" ? <Dashboard student={student} summary={summary} tasks={workspace.tasks} leaves={workspace.leaves} attendance={workspace.attendances} events={workspace.calendars} /> : null}
        {route === "profile" ? <Profile student={student} faceProfile={workspace.faceProfile} /> : null}
        {route === "attendance" ? <AttendancePage cameraOn={cameraOn} videoRef={videoRef} startCamera={startCamera} stopCamera={stopCamera} clock={clock} summary={summary} records={workspace.attendances} faceSamples={faceSamples} captureFaceRegistrationSample={captureFaceRegistrationSample} saveFaceRegistration={saveFaceRegistration} faceProfile={workspace.faceProfile} verificationBusy={verificationBusy} livenessPrompt={livenessPrompt} regularizations={workspace.regularizations} regularizationForm={regularizationForm} setRegularizationForm={setRegularizationForm} submitRegularization={submitRegularization} /> : null}
        {route === "tasks" ? <TasksPage tasks={workspace.tasks} updateTask={updateTask} /> : null}
        {route === "leaves" ? <LeavesPage leaves={workspace.leaves} leaveForm={leaveForm} setLeaveForm={setLeaveForm} applyLeave={applyLeave} /> : null}
        {route === "reports" ? <ReportsPage summary={summary} exportReport={exportReport} /> : null}
        {route === "calendar" ? <CalendarPage events={workspace.calendars} /> : null}
      </section>
      {notice ? <div className={`toast ${error === notice ? "error" : ""}`}>{notice}</div> : null}
    </main>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon: ReactNode }) {
  return <article className="stat-card">{icon}<span>{label}</span><strong>{value}</strong></article>;
}

function Dashboard({ student, summary, tasks, leaves, attendance, events }: { student: StudentUser; summary: Record<string, number>; tasks: StudentTask[]; leaves: StudentLeave[]; attendance: AttendanceRecord[]; events: StudentEvent[] }) {
  const recent = [
    attendance[0] ? `Attendance ${attendance[0].status || "present"} on ${attendance[0].date}` : "No attendance activity yet",
    tasks[0] ? `${tasks[0].title} is ${tasks[0].status.replace("_", " ")}` : "No tasks assigned yet",
    leaves[0] ? `${leaves[0].leaveType} leave is ${leaves[0].status}` : "No leave requests yet",
  ];
  return (
    <section className="welcome-dashboard">
      <div className="hero-panel">
        <div><span className="eyebrow"><FileBarChart /> Student dashboard</span><h1>Welcome, {firstName(student.name)}.</h1><p>Keep attendance, submissions, leaves, reports, and upcoming events in view.</p></div>
        <div className="system-card"><UserRound /><strong>{student.studentId}</strong><span>{student.profile || "Student profile"}</span></div>
      </div>
      <div className="stats-grid">
        <Stat label="Attendance" value={`${summary.attendancePercentage}%`} icon={<CalendarCheck />} />
        <Stat label="Present Days" value={summary.present} icon={<Check />} />
        <Stat label="Absent Days" value={summary.absent} icon={<CalendarDays />} />
        <Stat label="Pending Tasks" value={summary.pendingTasks} icon={<ClipboardList />} />
        <Stat label="Completed Tasks" value={summary.completedTasks} icon={<Check />} />
        <Stat label="Leave Requests" value={summary.leaveRequests} icon={<CalendarCheck />} />
        <Stat label="Upcoming Events" value={summary.upcomingEvents} icon={<CalendarDays />} />
      </div>
      <section className="panel">
        <div className="section-heading"><div><h1>Student profile summary</h1><p>Attendance progress, quick actions, recent activities, and upcoming events.</p></div></div>
        <div className="student-dashboard-grid">
          <article className="system-card"><strong>Attendance progress</strong><div className="task-progress"><span style={{ width: `${summary.attendancePercentage}%` }} /></div><span>{summary.present} of {summary.workingDays} attendance records present</span></article>
          <article className="system-card"><strong>Quick actions</strong><div className="hero-actions"><button className="ghost-button" onClick={() => window.location.href = "/student-attendance"}>Attendance</button><button className="ghost-button" onClick={() => window.location.href = "/student-tasks"}>Tasks</button><button className="ghost-button" onClick={() => window.location.href = "/student-leaves"}>Apply leave</button></div></article>
          <article className="system-card"><strong>Recent activities</strong>{recent.map((item) => <span key={item}>{item}</span>)}</article>
          <article className="system-card"><strong>Upcoming events</strong>{events.slice(0, 4).map((event) => <span key={event._id || event.id}>{event.title} - {event.startDate}</span>)}</article>
        </div>
      </section>
    </section>
  );
}

function Profile({ student, faceProfile }: { student: StudentUser; faceProfile: FaceStatus }) {
  return <section className="panel"><div className="section-heading"><div><h1>Student profile</h1><p>MongoDB student profile and face registration status.</p></div></div><div className="profile-detail-grid">{Object.entries({ "Student ID": student.studentId, Name: student.name, Email: student.email, Phone: student.phone || "Not set", Branch: student.branchId || "Not assigned", DOB: student.dob || "Not set", "Face Status": faceProfile.registered ? "Registered" : "Not registered", "Last Registration": faceProfile.updatedAt ? formatDateTime(faceProfile.updatedAt) : "Not registered" }).map(([key, value]) => <article className="system-card" key={key}><span>{key}</span><strong>{value}</strong></article>)}</div></section>;
}

function AttendancePage(props: { cameraOn: boolean; videoRef: React.RefObject<HTMLVideoElement | null>; startCamera: () => void; stopCamera: () => void; clock: (type: "clockin" | "clockout") => void; summary: Record<string, number>; records: AttendanceRecord[]; faceSamples: FaceSample[]; captureFaceRegistrationSample: () => void; saveFaceRegistration: () => void; faceProfile: FaceStatus; verificationBusy: boolean; livenessPrompt: string; regularizations: Regularization[]; regularizationForm: typeof emptyRegularization; setRegularizationForm: (value: typeof emptyRegularization) => void; submitRegularization: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <section className="panel">
      <div className="section-heading"><div><h1>Student attendance</h1><p>Face enrollment, face verification, liveness, GPS, and attendance regularization.</p></div></div>
      <div className="stats-grid"><Stat label="Attendance" value={`${props.summary.attendancePercentage}%`} icon={<CalendarCheck />} /><Stat label="Present Days" value={props.summary.present} icon={<Check />} /><Stat label="Absent Days" value={props.summary.absent} icon={<CalendarDays />} /><Stat label="Face Verified" value={props.summary.faceVerified} icon={<Camera />} /><Stat label="GPS Verified" value={props.summary.gpsVerified} icon={<FileBarChart />} /></div>
      <div className="attendance-console">
        <video ref={props.videoRef} autoPlay muted playsInline />
        <div className="hero-actions">
          {!props.cameraOn ? <button className="primary-button compact" onClick={props.startCamera}><Camera /> Start camera</button> : <button className="ghost-button" onClick={props.stopCamera}>Stop camera</button>}
          <button className="ghost-button" disabled={!props.cameraOn || props.verificationBusy || props.faceSamples.length >= 10} onClick={props.captureFaceRegistrationSample}>Capture face sample</button>
          <button className="ghost-button" disabled={props.verificationBusy || props.faceSamples.length < 3} onClick={props.saveFaceRegistration}>{props.faceProfile.registered ? "Re-register Face" : "Register Face"}</button>
          <button className="primary-button compact" disabled={!props.cameraOn || props.verificationBusy} onClick={() => props.clock("clockin")}>Clock In</button>
          <button className="ghost-button" disabled={!props.cameraOn || props.verificationBusy} onClick={() => props.clock("clockout")}>Clock Out</button>
        </div>
        <div className="branch-metrics"><span>Face status: {props.faceProfile.registered ? `Registered (${props.faceProfile.samples} samples)` : "Not registered"}</span><span>{props.faceSamples.length}/10 new samples</span><span>{props.livenessPrompt || "Liveness prompt appears during attendance"}</span></div>
      </div>
      <form className="inline-form" onSubmit={props.submitRegularization}>
        <select value={props.regularizationForm.type} onChange={(event) => props.setRegularizationForm({ ...props.regularizationForm, type: event.target.value as RegularizationType })}><option value="missing_clock_in">Missing Clock In</option><option value="missing_clock_out">Missing Clock Out</option><option value="attendance_correction">Attendance Correction</option><option value="late_entry">Late Entry Request</option></select>
        <input type="date" value={props.regularizationForm.date} onChange={(event) => props.setRegularizationForm({ ...props.regularizationForm, date: event.target.value })} required />
        <input type="time" value={props.regularizationForm.requestedClockIn} onChange={(event) => props.setRegularizationForm({ ...props.regularizationForm, requestedClockIn: event.target.value })} />
        <input type="time" value={props.regularizationForm.requestedClockOut} onChange={(event) => props.setRegularizationForm({ ...props.regularizationForm, requestedClockOut: event.target.value })} />
        <input value={props.regularizationForm.reason} onChange={(event) => props.setRegularizationForm({ ...props.regularizationForm, reason: event.target.value })} placeholder="Reason" required />
        <button className="primary-button compact" type="submit">Submit Request</button>
      </form>
      <StudentTable rows={props.records.map((item) => ["Attendance", item.date, formatDateTime(item.clockInAt), formatDateTime(item.clockOutAt), item.status || "present", `Face ${item.matchScore || 0}%`, item.gpsVerified ? "GPS Verified" : "GPS Pending", item.livenessVerified ? "Liveness Passed" : "Liveness Pending", item.invalidReason || item.securityWarning || "Verified record"])} empty="No attendance history yet." />
      <StudentTable rows={props.regularizations.map((item) => ["Regularization", item.type.replaceAll("_", " "), item.date, item.reason, item.status])} empty="No regularization requests yet." />
    </section>
  );
}

function TasksPage({ tasks, updateTask }: { tasks: StudentTask[]; updateTask: (task: StudentTask, status: TaskStatus, remarks: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, { status: TaskStatus; remarks: string }>>({});
  return <section className="panel"><div className="section-heading"><div><h1>Student tasks</h1><p>Daily assignments, internship tasks, submissions, remarks, and deadlines.</p></div></div><div className="task-grid">{tasks.map((task) => { const draft = drafts[task.assignmentId] || { status: task.status, remarks: task.remarks }; return <article className="task-card" key={task.assignmentId}><div className="task-card-head"><div><strong>{task.title}</strong><span>{task.category} - due {task.deadline}</span></div><span className={`pill ${task.priority}`}>{task.priority}</span></div><p>{task.description || task.remarks || "No description added."}</p><div className="task-controls"><select value={draft.status} onChange={(event) => setDrafts({ ...drafts, [task.assignmentId]: { ...draft, status: event.target.value as TaskStatus } })}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select><input value={draft.remarks} onChange={(event) => setDrafts({ ...drafts, [task.assignmentId]: { ...draft, remarks: event.target.value } })} placeholder="Submission remarks" /><button className="primary-button compact" onClick={() => updateTask(task, draft.status, draft.remarks)}>Update</button></div><span className={`pill ${draft.status}`}>{draft.status.replace("_", " ")}</span></article>; })}</div>{!tasks.length ? <StudentTable rows={[]} empty="No tasks assigned yet." /> : null}</section>;
}

function LeavesPage({ leaves, leaveForm, setLeaveForm, applyLeave }: { leaves: StudentLeave[]; leaveForm: typeof emptyLeave; setLeaveForm: (value: typeof emptyLeave) => void; applyLeave: (event: FormEvent<HTMLFormElement>) => void }) {
  return <section className="panel"><div className="section-heading"><div><h1>Student leaves</h1><p>Casual leave, sick leave, permission requests, and approval status.</p></div></div><form className="inline-form" onSubmit={applyLeave}><select value={leaveForm.leaveType} onChange={(event) => setLeaveForm({ ...leaveForm, leaveType: event.target.value as StudentLeave["leaveType"] })}><option value="casual">Casual Leave</option><option value="sick">Sick Leave</option><option value="permission">Permission</option></select><input type="date" value={leaveForm.fromDate} onChange={(event) => setLeaveForm({ ...leaveForm, fromDate: event.target.value })} required /><input type="date" value={leaveForm.toDate} onChange={(event) => setLeaveForm({ ...leaveForm, toDate: event.target.value })} required /><input value={leaveForm.reason} onChange={(event) => setLeaveForm({ ...leaveForm, reason: event.target.value })} placeholder="Reason" required /><button className="primary-button compact" type="submit">Apply Leave</button></form><StudentTable rows={leaves.map((item) => [item.leaveType, `${item.fromDate} to ${item.toDate}`, item.reason, item.status])} empty="No leave requests yet." /></section>;
}

function ReportsPage({ summary, exportReport }: { summary: Record<string, number>; exportReport: (format: "pdf" | "excel") => void }) {
  return <section className="panel"><div className="section-heading"><div><h1>Student reports</h1><p>Attendance and task completion summaries with PDF and Excel export.</p></div><div className="report-actions"><button className="ghost-button" onClick={() => exportReport("pdf")}><Download /> Export PDF</button><button className="ghost-button" onClick={() => exportReport("excel")}><FileSpreadsheet /> Export Excel</button></div></div><div className="stats-grid"><Stat label="Attendance" value={`${summary.attendancePercentage}%`} icon={<CalendarCheck />} /><Stat label="Present Days" value={summary.present} icon={<Check />} /><Stat label="Absent Days" value={summary.absent} icon={<CalendarDays />} /><Stat label="Working Days" value={summary.workingDays} icon={<FileBarChart />} /><Stat label="Completed Tasks" value={summary.completedTasks} icon={<Check />} /><Stat label="Pending Tasks" value={summary.pendingTasks} icon={<ClipboardList />} /><Stat label="Task Completion" value={`${summary.taskCompletion}%`} icon={<FileSpreadsheet />} /></div></section>;
}

function CalendarPage({ events }: { events: StudentEvent[] }) {
  return <section className="panel"><div className="section-heading"><div><h1>Student calendar</h1><p>Holidays, exams, company events, and training schedules from MongoDB.</p></div></div><div className="calendar-grid">{events.map((event) => <article className="calendar-card" key={event._id || event.id}><div className="task-card-head"><div><strong>{event.title}</strong><span>{event.startDate}{event.endDate && event.endDate !== event.startDate ? ` to ${event.endDate}` : ""}</span></div><span className="pill student">{event.type.replaceAll("_", " ")}</span></div><p>{event.description || "No note added."}</p></article>)}</div>{!events.length ? <StudentTable rows={[]} empty="No calendar events yet." /> : null}</section>;
}

function StudentTable({ rows, empty }: { rows: Array<Array<string | number>>; empty: string }) {
  return <div className="table-list">{rows.length ? rows.map((row, index) => <article className="table-row student-table-row" key={`${row[0]}-${index}`}>{row.map((cell, cellIndex) => <span key={`${cell}-${cellIndex}`}>{cell}</span>)}</article>) : <article className="table-row"><strong>{empty}</strong></article>}</div>;
}
