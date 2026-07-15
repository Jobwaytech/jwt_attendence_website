"use client";

import {
  Building2,
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
  Flag,
  Bell,
  IdCard,
  WalletCards,
  MapPin,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  MoreVertical,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  UserPlus,
  UserCheck,
  UserX,
  Users,
  GraduationCap,
  Percent,
  X,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  apiRequest as serviceApiRequest,
  mongoCreate,
  mongoDelete,
  mongoList,
  mongoUpdate,
} from "./services/api";
import { fetchWithRetry } from "./services/fetchWithRetry";
import {
  browserFingerprint,
  captureFaceSample,
  clockAttendance,
  deviceInfo,
  nextFaceSampleLabel,
  registerFaceProfile,
  runLivenessChallenge,
  type FaceSample,
} from "./services/faceVerification";

type LoginRole = "super_admin" | "branch_admin" | "employee" | "student";
type LegacyStaffRole =
  | "branch_head"
  | "branch_incharge"
  | "customer_representative"
  | "hr"
  | "trainer"
  | "examiner";
type Role = LoginRole | LegacyStaffRole;
type View =
  | "dashboard"
  | "users"
  | "branches"
  | "emp-details"
  | "attendance"
  | "leaves"
  | "tasks"
  | "calendar"
  | "payroll"
  | "regularization"
  | "reports"
  | "security";
type Theme = "light" | "dark";

type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel?: string;
  branchId?: string | null;
  phone?: string;
  dob?: string;
  dateOfJoining?: string;
  bankName?: string;
  bankAccountNumber?: string;
  panNumber?: string;
  profile?: string;
  employeeId?: string;
  studentId?: string;
  salary?: number;
  provider?: string;
  picture?: string;
  createdAt?: string;
};

type Branch = {
  id: string;
  name: string;
  code: string;
  address: string;
  manager: string;
  contactEmail: string;
  contactPhone: string;
  employees?: number;
  students?: number;
};

type Attendance = {
  id: string;
  userId: string;
  branchId?: string | null;
  employeeName?: string;
  employeeCode?: string;
  roleLabel?: string;
  date: string;
  clockInAt?: string;
  clockOutAt?: string | null;
  status?: "present" | "absent" | "invalid";
  invalidReason?: string | null;
  clockInLocation?: LocationStamp | null;
  clockOutLocation?: LocationStamp | null;
  locationDistanceMeters?: number | null;
  allowedRadiusMeters?: number;
  verification?: string;
  faceVerified?: boolean;
  matchScore?: number;
  livenessVerified?: boolean;
  livenessChallenge?: string;
  latitude?: number;
  longitude?: number;
  distanceFromOffice?: number;
  gpsVerified?: boolean;
  browserFingerprint?: string;
  deviceInfo?: string;
  ipAddress?: string;
  trustedDevice?: boolean;
  securityWarning?: string;
};

type AttendancePersonRow = {
  user: User;
  record?: Attendance;
};

type LocationStamp = {
  latitude: number;
  longitude: number;
  address: string;
  capturedAt?: string;
};

type Leave = {
  id: string;
  userId: string;
  employeeName?: string;
  leaveType: "casual" | "sick" | "permission";
  fromDate: string;
  toDate: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
};

type BranchReport = {
  branchId: string;
  branchName: string;
  employees: number;
  students: number;
  attendanceToday: number;
  absentees: number;
  pendingLeaves: number;
};

type TaskStatus = "pending" | "in_progress" | "completed" | "hold" | "rejected";
type TaskPriority = "low" | "medium" | "high" | "urgent";

type TaskItem = {
  id: string;
  assignmentId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  deadline: string;
  employeeName?: string;
  assignedUserId: string;
  status: TaskStatus;
  progress: number;
  remarks?: string;
  assignedAt?: string;
  assignmentType?: "individual" | "team";
  teamName?: string | null;
};

type MonthlyReport = {
  month: string;
  totals: {
    employees: number;
    students: number;
    attendanceRecords: number;
    assignedTasks: number;
    completedTasks: number;
    overdueTasks: number;
    leaveRequests: number;
    payrollProcessed: number;
    payrollNetPay: number;
  };
  rows: {
    employeeId: string;
    employeeName: string;
    role: Role;
    attendanceDays: number;
    attendancePercentage: number;
    completedTasks: number;
    totalTasks: number;
    completionRate: number;
    averageProgress: number;
    leaveRequests: number;
    netPay: number;
  }[];
};

type CalendarEventType =
  | "company_holiday"
  | "branch_holiday"
  | "national_holiday"
  | "government_holiday"
  | "employee_event"
  | "student_event"
  | "meeting_reminder"
  | "training_schedule"
  | "exam_schedule"
  | "birthday";

type CalendarEvent = {
  id: string;
  title: string;
  type: CalendarEventType;
  scope: "company" | "branch" | "employee" | "student";
  branchId?: string | null;
  branchName?: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  studentId?: string | null;
  studentName?: string | null;
  startDate: string;
  endDate: string;
  startTime?: string;
  description?: string;
  source?: "default" | "custom";
};

type CompanyHoliday = {
  id: string;
  name: string;
  date: string;
  type: "National Holiday" | "Government Holiday";
  source: "default" | "custom";
};

type Team = {
  id: string;
  name: string;
  branchId: string;
  type: string;
  members: { userId: string; name: string; role: Role }[];
};

type PayrollRow = {
  id: string;
  userId: string;
  employeeName: string;
  employeeId: string;
  branchId: string;
  month: string;
  salary: number;
  deductions: number;
  bonuses: number;
  netPay: number;
};

type RegularizationRequest = {
  id: string;
  userId: string;
  userName?: string;
  type:
    | "missing_clock_in"
    | "missing_clock_out"
    | "attendance_correction"
    | "late_entry";
  date: string;
  requestedClockIn?: string;
  requestedClockOut?: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
};

type SessionResponse = {
  token?: string;
  user?: User;
};

type MongoUser = User & { _id: string };
type MongoBranch = Branch & { _id: string };
type MongoAttendance = Attendance & { _id: string };
type MongoLeave = Leave & {
  _id: string;
  decidedBy?: string;
  decidedAt?: string;
};
type MongoAssignment = {
  _id: string;
  userId: string;
  status: TaskStatus;
  progress: number;
  remarks?: string;
  updatedAt?: string;
};
type MongoTask = {
  _id: string;
  title: string;
  description?: string;
  branchId?: string | null;
  priority: TaskPriority;
  deadline: string;
  assignmentType?: "individual" | "team";
  teamName?: string | null;
  assignments?: MongoAssignment[];
  createdAt?: string;
};
type MongoPayroll = {
  _id: string;
  userId: string;
  branchId?: string | null;
  month: string;
  salary?: number;
  totalDeductions?: number;
  bonus?: number;
  bonuses?: number;
  netPay?: number;
};
type MongoCalendar = CalendarEvent & {
  _id: string;
  source?: "default" | "custom";
};
type MongoReport = {
  _id: string;
  reportType: string;
  month?: string;
  branchId?: string | null;
  totals?: MonthlyReport["totals"];
  rows?: MonthlyReport["rows"];
  notes?: string;
};
type MongoRegularization = RegularizationRequest & {
  _id: string;
  branchId?: string | null;
};
type AnalyticsData = {
  cards: Record<string, number>;
  charts: {
    attendanceTrend: Record<string, number>;
    payrollTrend: Record<string, number>;
    leaveTrend: Record<string, number>;
    taskCompletionTrend: Record<string, number>;
    branchPerformance: {
      branch: string;
      attendance: number;
      employees: number;
    }[];
  };
};
type DashboardStats = {
  users: number;
  openTasks: number;
};
type ReportType =
  | "employee-attendance"
  | "student-attendance"
  | "leave"
  | "task"
  | "payroll"
  | "branch-performance";

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: "employee-attendance", label: "Employee Attendance" },
  { value: "student-attendance", label: "Student Attendance" },
  { value: "leave", label: "Leave Report" },
  { value: "task", label: "Task Completion" },
  { value: "payroll", label: "Payroll Report" },
  { value: "branch-performance", label: "Branch Performance" },
];

const ROLE_OPTIONS: { value: LoginRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "branch_admin", label: "Branch Admin" },
  { value: "employee", label: "Employee" },
  { value: "student", label: "Student" },
];

const PROFILE_ROLE_OPTIONS = [
  "Student",
  "Branch Head",
  "Branch Incharge",
  "Customer Support Representative",
  "HR",
  "Trainer",
  "Examiner",
];
const STORAGE_KEYS = {
  token: "authflow_next_token",
  user: "authflow_next_user",
  theme: "authflow_next_theme",
};

const emptyUserForm = {
  name: "",
  email: "",
  password: "",
  role: "employee" as Role,
  branchId: "",
  phone: "",
  picture: "",
  dob: "",
  dateOfJoining: "",
  bankName: "",
  bankAccountNumber: "",
  panNumber: "",
  profile: "",
  employeeId: "",
};

const emptyUserEditForm = {
  name: "",
  email: "",
  role: "employee" as Role,
  branchId: "",
  phone: "",
  picture: "",
  dob: "",
  dateOfJoining: "",
  bankName: "",
  bankAccountNumber: "",
  panNumber: "",
  profile: "",
  employeeId: "",
  studentId: "",
  salary: "",
};

const emptyEmpDetailsForm = {
  dateOfJoining: "",
  bankName: "",
  bankAccountNumber: "",
  panNumber: "",
};

const emptyBranchForm = {
  name: "",
  code: "",
  address: "",
  manager: "",
  contactEmail: "",
  contactPhone: "",
};

const emptyLeaveForm = {
  leaveType: "casual" as Leave["leaveType"],
  fromDate: "",
  toDate: "",
  reason: "",
};

const emptyTaskForm = {
  title: "",
  description: "",
  assignedUserId: "",
  teamId: "",
  priority: "medium" as TaskPriority,
  deadline: "",
};

const emptyTeamForm = {
  name: "",
  branchId: "",
  type: "employee",
  memberIds: [] as string[],
};

const emptyCalendarForm = {
  title: "",
  type: "company_holiday" as CalendarEventType,
  branchId: "",
  employeeId: "",
  studentId: "",
  startDate: "",
  endDate: "",
  startTime: "",
  description: "",
};

const emptyHolidayForm = {
  name: "",
  date: "",
  type: "Government Holiday" as CompanyHoliday["type"],
};

const emptyRegularizationForm = {
  type: "missing_clock_in" as RegularizationRequest["type"],
  date: "",
  requestedClockIn: "",
  requestedClockOut: "",
  reason: "",
};

const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "hold", label: "Hold" },
  { value: "rejected", label: "Rejected" },
];

const CALENDAR_TYPE_OPTIONS: { value: CalendarEventType; label: string }[] = [
  { value: "company_holiday", label: "Company Holiday" },
  { value: "branch_holiday", label: "Branch Holiday" },
  { value: "national_holiday", label: "National Holiday" },
  { value: "government_holiday", label: "Government Holiday" },
  { value: "employee_event", label: "Employee Event" },
  { value: "student_event", label: "Student Event" },
  { value: "meeting_reminder", label: "Meeting Reminder" },
  { value: "training_schedule", label: "Training Schedule" },
  { value: "exam_schedule", label: "Exam Schedule" },
];

const HOLIDAY_TYPE_OPTIONS: CompanyHoliday["type"][] = [
  "National Holiday",
  "Government Holiday",
];

const REGULARIZATION_TYPE_LABELS: Record<
  RegularizationRequest["type"],
  string
> = {
  missing_clock_in: "Missing clock in",
  missing_clock_out: "Missing clock out",
  attendance_correction: "Attendance correction",
  late_entry: "Late entry request",
};

const DEFAULT_INDIAN_GOVERNMENT_HOLIDAYS_2026: Omit<
  CompanyHoliday,
  "id" | "source"
>[] = [
  { name: "Republic Day", date: "2026-01-26", type: "National Holiday" },
  { name: "Mahashivratri", date: "2026-02-15", type: "Government Holiday" },
  { name: "Holi", date: "2026-03-04", type: "Government Holiday" },
  { name: "Ram Navami", date: "2026-03-26", type: "Government Holiday" },
  { name: "Mahavir Jayanti", date: "2026-03-31", type: "Government Holiday" },
  { name: "Good Friday", date: "2026-04-03", type: "Government Holiday" },
  {
    name: "Dr. B.R. Ambedkar Jayanti",
    date: "2026-04-14",
    type: "Government Holiday",
  },
  { name: "Buddha Purnima", date: "2026-05-01", type: "Government Holiday" },
  {
    name: "Bakrid / Eid al-Adha",
    date: "2026-05-27",
    type: "Government Holiday",
  },
  { name: "Muharram", date: "2026-06-26", type: "Government Holiday" },
  { name: "Independence Day", date: "2026-08-15", type: "National Holiday" },
  { name: "Milad-un-Nabi", date: "2026-08-26", type: "Government Holiday" },
  { name: "Janmashtami", date: "2026-09-04", type: "Government Holiday" },
  { name: "Gandhi Jayanti", date: "2026-10-02", type: "National Holiday" },
  { name: "Dussehra", date: "2026-10-20", type: "Government Holiday" },
  { name: "Diwali", date: "2026-11-08", type: "Government Holiday" },
  {
    name: "Guru Nanak Jayanti",
    date: "2026-11-24",
    type: "Government Holiday",
  },
  { name: "Christmas Day", date: "2026-12-25", type: "Government Holiday" },
];

function defaultCompanyHolidays(): CompanyHoliday[] {
  return DEFAULT_INDIAN_GOVERNMENT_HOLIDAYS_2026.map((holiday) => ({
    ...holiday,
    id: `india-gov-${holiday.date}-${holiday.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}`,
    source: "default" as const,
  }));
}

function mergeCompanyHolidays(customHolidays: CompanyHoliday[]) {
  const holidays = [...defaultCompanyHolidays()];
  const seen = new Set(
    holidays.map((holiday) => `${holiday.date}-${holiday.name.toLowerCase()}`),
  );
  customHolidays.forEach((holiday) => {
    const key = `${holiday.date}-${holiday.name.toLowerCase()}`;
    if (!seen.has(key)) {
      holidays.push(holiday);
      seen.add(key);
    }
  });
  return holidays;
}

function docId<T extends { _id?: string; id?: string }>(doc: T) {
  return doc.id || doc._id || "";
}

function mapMongoUser(user: MongoUser): User {
  return { ...user, id: docId(user), branchId: user.branchId || null };
}

function mapMongoBranch(branch: MongoBranch, users: User[]): Branch {
  return {
    ...branch,
    id: docId(branch),
    employees: users.filter(
      (user) =>
        user.branchId === docId(branch) &&
        ["branch_admin", "employee"].includes(effectiveRole(user.role)),
    ).length,
    students: users.filter(
      (user) => user.branchId === docId(branch) && user.role === "student",
    ).length,
  };
}

function mapMongoAttendance(row: MongoAttendance, users: User[]): Attendance {
  const id = docId(row);
  const userId = String(row.userId || "");
  const user = users.find((item) => item.id === userId);
  return {
    ...row,
    id,
    userId,
    branchId: row.branchId || user?.branchId || null,
    employeeName: user?.name || "Unknown",
    employeeCode: user?.employeeId || user?.studentId || userId,
    roleLabel: user?.roleLabel || user?.role,
  };
}

function mapMongoLeave(row: MongoLeave, users: User[]): Leave {
  const id = docId(row);
  const userId = String(row.userId || "");
  return {
    ...row,
    id,
    userId,
    employeeName: users.find((user) => user.id === userId)?.name || "Unknown",
  };
}

function mapMongoTasks(tasks: MongoTask[], users: User[]): TaskItem[] {
  return tasks.flatMap((task) =>
    (task.assignments?.length
      ? task.assignments
      : [
          {
            _id: docId(task),
            userId: "",
            status: "pending" as TaskStatus,
            progress: 0,
          },
        ]
    ).map((assignment) => {
      const userId = String(assignment.userId || "");
      return {
        id: docId(task),
        assignmentId: assignment._id || docId(task),
        title: task.title,
        description: task.description || "",
        priority: task.priority,
        deadline: task.deadline,
        employeeName:
          users.find((user) => user.id === userId)?.name || "Unknown",
        assignedUserId: userId,
        status: assignment.status,
        progress: assignment.progress || 0,
        remarks: assignment.remarks || "",
        assignedAt: task.createdAt,
        assignmentType: task.assignmentType || "individual",
        teamName: task.teamName || null,
      };
    }),
  );
}

function mapMongoPayroll(
  row: MongoPayroll,
  users: User[],
  fallbackUser?: User | null,
): PayrollRow {
  const user = users.find((item) => item.id === String(row.userId));
  const displayUser = user || fallbackUser || null;
  return {
    id: docId(row),
    userId: String(row.userId || ""),
    employeeName: displayUser?.name || "Unknown",
    employeeId: displayUser?.employeeId || String(row.userId || ""),
    branchId: String(row.branchId || displayUser?.branchId || ""),
    month: row.month,
    salary: Number(row.salary || 0),
    deductions: Number(row.totalDeductions || 0),
    bonuses: Number(row.bonus ?? row.bonuses ?? 0),
    netPay: Number(row.netPay || 0),
  };
}

function mapMongoCalendar(
  event: MongoCalendar,
  users: User[],
  branches: Branch[],
): CalendarEvent {
  const branchId = String(event.branchId || "");
  const employeeId = String(event.employeeId || "");
  const studentId = String(event.studentId || "");
  return {
    ...event,
    id: docId(event),
    branchId: branchId || null,
    employeeId: employeeId || null,
    studentId: studentId || null,
    branchName: branches.find((branch) => branch.id === branchId)?.name || null,
    employeeName: users.find((user) => user.id === employeeId)?.name || null,
    studentName: users.find((user) => user.id === studentId)?.name || null,
  };
}

function calendarEventToHoliday(
  event: CalendarEvent & { source?: "default" | "custom" },
): CompanyHoliday | null {
  if (
    ![
      "national_holiday",
      "government_holiday",
      "company_holiday",
      "branch_holiday",
    ].includes(event.type)
  )
    return null;
  const description = event.description || "";
  const type =
    event.type === "national_holiday" ||
    description.includes("National Holiday")
      ? "National Holiday"
      : event.type === "government_holiday" ||
          description.includes("Government Holiday")
        ? "Government Holiday"
        : null;
  if (!type) return null;
  return {
    id: event.id,
    name: event.title,
    date: event.startDate,
    type,
    source:
      event.source ||
      (event.id.startsWith("india-gov-") ? "default" : "custom"),
  };
}

function branchReportsFromMongo(
  branches: Branch[],
  users: User[],
  attendance: Attendance[],
  leaves: Leave[],
): BranchReport[] {
  const today = new Date().toISOString().slice(0, 10);
  return branches.map((branch) => {
    const employees = users.filter(
      (user) =>
        user.branchId === branch.id &&
        ["branch_admin", "employee"].includes(effectiveRole(user.role)),
    ).length;
    const students = users.filter(
      (user) => user.branchId === branch.id && user.role === "student",
    ).length;
    const attendanceToday = attendance.filter(
      (item) =>
        item.date === today &&
        users.find((user) => user.id === item.userId)?.branchId === branch.id,
    ).length;
    return {
      branchId: branch.id,
      branchName: branch.name,
      employees,
      students,
      attendanceToday,
      absentees: Math.max(0, employees + students - attendanceToday),
      pendingLeaves: leaves.filter(
        (item) =>
          item.status === "pending" &&
          users.find((user) => user.id === item.userId)?.branchId === branch.id,
      ).length,
    };
  });
}

function formatAttendanceTime(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(date);
}

function formatDate(value?: string | null) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(date);
}

function dateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function initials(name?: string | null) {
  const safeName = String(name || "").trim();
  if (!safeName) return "NA";
  return safeName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function displayName(name?: string | null) {
  return String(name || "").trim() || "Unknown User";
}

function firstName(name?: string | null) {
  return displayName(name).split(" ")[0];
}

function taskUserLabel(user: User, users: User[]) {
  const role = effectiveRole(user.role);
  if (role === "student") {
    const index = users
      .filter((item) => effectiveRole(item.role) === "student")
      .findIndex((item) => item.id === user.id);
    return `S${index + 1}`;
  }
  if (role === "employee") {
    const employeeSlot = String(user.employeeId || "").match(
      /^EMP-E(\d+)$/i,
    )?.[1];
    if (employeeSlot) return `E${employeeSlot}`;
    const index = users
      .filter((item) => effectiveRole(item.role) === "employee")
      .findIndex((item) => item.id === user.id);
    return `E${index + 1}`;
  }
  return displayName(user.name);
}

function isTaskEmployeeUser(user: User) {
  return effectiveRole(user.role) === "employee";
}

function taskUserSortValue(user: User) {
  const role = effectiveRole(user.role);
  const employeeSlot = String(user.employeeId || "").match(
    /^EMP-E(\d+)$/i,
  )?.[1];
  if (employeeSlot) return Number(employeeSlot);
  if (role === "employee") return 100;
  if (role === "student") return 200;
  return 300;
}

function taskUserDetail(user: User, branches: Branch[]) {
  const branch =
    branches.find((item) => item.id === user.branchId)?.name || "No branch";
  return `${displayName(user.name)} - ${branch}`;
}

function compareTaskUsers(first: User, second: User) {
  return (
    taskUserSortValue(first) - taskUserSortValue(second) ||
    displayName(first.name).localeCompare(displayName(second.name))
  );
}

function previousMonthKey(value = new Date()) {
  const date = new Date(value);
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 7);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
    style: "currency",
    currency: "INR",
  }).format(value || 0);
}

function effectiveRole(role?: string | null): LoginRole {
  if (
    role === "super_admin" ||
    role === "branch_admin" ||
    role === "employee" ||
    role === "student"
  )
    return role;
  return "employee";
}

function canManage(session: User | null) {
  return (
    !!session &&
    ["super_admin", "branch_admin"].includes(effectiveRole(session.role))
  );
}

function canUseEmployeeTools(session: User | null) {
  return (
    !!session &&
    ["employee", "branch_admin"].includes(effectiveRole(session.role))
  );
}

function canApplyLeave(session: User | null) {
  return (
    !!session &&
    ["employee", "student", "branch_admin"].includes(effectiveRole(session.role))
  );
}

function canClockAttendance(session: User | null) {
  return (
    !!session &&
    ["employee", "student", "branch_admin"].includes(
      effectiveRole(session.role),
    )
  );
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>("light");
  const [session, setSession] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [view, setView] = useState<View>("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
    role: "super_admin" as Role,
  });
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [reports, setReports] = useState<BranchReport[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [calendarNotifications, setCalendarNotifications] = useState<
    CalendarEvent[]
  >([]);
  const [companyHolidays, setCompanyHolidays] = useState<CompanyHoliday[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [regularization, setRegularization] = useState<RegularizationRequest[]>(
    [],
  );
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(
    null,
  );
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [reportType, setReportType] = useState<ReportType>(
    "employee-attendance",
  );
  const [reportMonth, setReportMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [payrollBranchId, setPayrollBranchId] = useState("");
  const [attendanceMonitorDate, setAttendanceMonitorDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [attendanceMonitorBranchId, setAttendanceMonitorBranchId] =
    useState("");
  const [attendanceMonitorRole, setAttendanceMonitorRole] = useState<
    "all" | "branch_admin" | "employee" | "student"
  >("all");
  const [search, setSearch] = useState("");
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [editingUserId, setEditingUserId] = useState("");
  const [userEditForm, setUserEditForm] = useState(emptyUserEditForm);
  const [editingEmpDetailsId, setEditingEmpDetailsId] = useState("");
  const [empDetailsForm, setEmpDetailsForm] = useState(emptyEmpDetailsForm);
  const [branchForm, setBranchForm] = useState(emptyBranchForm);
  const [editingBranchId, setEditingBranchId] = useState("");
  const [branchEditForm, setBranchEditForm] = useState(emptyBranchForm);
  const [leaveForm, setLeaveForm] = useState(emptyLeaveForm);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [teamForm, setTeamForm] = useState(emptyTeamForm);
  const [calendarForm, setCalendarForm] = useState(emptyCalendarForm);
  const [holidayForm, setHolidayForm] = useState(emptyHolidayForm);
  const [editingHolidayId, setEditingHolidayId] = useState("");
  const [regularizationForm, setRegularizationForm] = useState(
    emptyRegularizationForm,
  );
  const [taskDrafts, setTaskDrafts] = useState<
    Record<string, { status: TaskStatus; progress: number; remarks: string }>
  >({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<string, string>>(
    {},
  );
  const [cameraOn, setCameraOn] = useState(false);
  const [faceSamples, setFaceSamples] = useState<FaceSample[]>([]);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [livenessPrompt, setLivenessPrompt] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const filteredUsers = useMemo(() => {
    const value = search.trim().toLowerCase();
    return users.filter((user) =>
      `${user.name} ${user.email} ${user.roleLabel} ${user.provider}`
        .toLowerCase()
        .includes(value),
    );
  }, [search, users]);

  const employeeUsers = useMemo(
    () =>
      users.filter((user) =>
        ["branch_admin", "employee"].includes(effectiveRole(user.role)),
      ),
    [users],
  );
  const studentUsers = useMemo(
    () => users.filter((user) => user.role === "student"),
    [users],
  );
  const assignableUsers = useMemo(
    () =>
      users.filter((user) =>
        ["branch_admin", "employee", "student"].includes(
          effectiveRole(user.role),
        ),
      ),
    [users],
  );
  const mongoSessionUser = useMemo(
    () => users.find((user) => user.email === session?.email) || session,
    [session, users],
  );
  const empDetailsUsers = useMemo(() => {
    if (canManage(session)) return employeeUsers;
    const userId = mongoSessionUser?.id || session?.id || "";
    return employeeUsers.filter((user) => user.id === userId);
  }, [employeeUsers, mongoSessionUser?.id, session]);
  const empDetailsRows = useMemo(() => {
    return empDetailsUsers.map((user) => ({ user }));
  }, [empDetailsUsers]);
  const payrollBranches = branches;
  const visiblePayroll = useMemo(
    () =>
      payroll.filter(
        (row) =>
          row.month === reportMonth &&
          (!payrollBranchId || row.branchId === payrollBranchId),
      ),
    [payroll, payrollBranchId, reportMonth],
  );

  const dailyAttendanceMonitor = useMemo(() => {
    const monitoredUsers = users.filter((user) => {
      const isTrackable = ["branch_admin", "employee", "student"].includes(
        effectiveRole(user.role),
      );
      const matchesBranch = attendanceMonitorBranchId
        ? user.branchId === attendanceMonitorBranchId
        : !!user.branchId;
      const matchesRole =
        attendanceMonitorRole === "all" ||
        effectiveRole(user.role) === attendanceMonitorRole;
      return isTrackable && matchesBranch && matchesRole;
    });
    const dayRecords = attendance.filter((record) => {
      const recordBranchId =
        record.branchId ||
        users.find((user) => user.id === record.userId)?.branchId ||
        "";
      const matchesBranch = attendanceMonitorBranchId
        ? recordBranchId === attendanceMonitorBranchId
        : true;
      return record.date === attendanceMonitorDate && matchesBranch;
    });
    const recordByUserId = new Map(
      dayRecords.map((record) => [record.userId, record]),
    );
    const presentIds = new Set(
      dayRecords
        .filter((record) => record.status === "present")
        .map((record) => record.userId),
    );
    const presentUsers = monitoredUsers
      .filter((user) => presentIds.has(user.id))
      .map((user) => ({ user, record: recordByUserId.get(user.id) }));
    const absentUsers = monitoredUsers
      .filter((user) => !presentIds.has(user.id))
      .map((user) => ({ user, record: recordByUserId.get(user.id) }));
    return {
      branchName: attendanceMonitorBranchId
        ? branches.find((branch) => branch.id === attendanceMonitorBranchId)
            ?.name || "Selected branch"
        : "All branches",
      total: monitoredUsers.length,
      presentUsers,
      absentUsers,
      records: dayRecords,
      attendancePercentage: monitoredUsers.length
        ? Math.round((presentUsers.length / monitoredUsers.length) * 100)
        : 0,
    };
  }, [
    attendance,
    attendanceMonitorBranchId,
    attendanceMonitorDate,
    attendanceMonitorRole,
    branches,
    users,
  ]);

  const attendanceSummaries = useMemo(() => {
    const dayRecords = attendance.filter((record) => {
      const recordBranchId =
        record.branchId ||
        users.find((user) => user.id === record.userId)?.branchId ||
        "";
      const matchesBranch = attendanceMonitorBranchId
        ? recordBranchId === attendanceMonitorBranchId
        : true;
      return record.date === attendanceMonitorDate && matchesBranch;
    });
    const presentIds = new Set(
      dayRecords
        .filter((record) => record.status === "present")
        .map((record) => record.userId),
    );
    const buildSummary = (role: "employee" | "student") => {
      const filtered = users.filter((user) => {
        const userRole = effectiveRole(user.role);
        const matchesRole =
          role === "employee"
            ? userRole === "employee"
            : userRole === "student";
        const matchesBranch = attendanceMonitorBranchId
          ? user.branchId === attendanceMonitorBranchId
          : !!user.branchId;
        return matchesRole && matchesBranch;
      });
      const presentCount = filtered.filter((user) =>
        presentIds.has(user.id),
      ).length;
      return {
        total: filtered.length,
        present: presentCount,
        absent: filtered.length - presentCount,
      };
    };
    return {
      branchName: attendanceMonitorBranchId
        ? branches.find((branch) => branch.id === attendanceMonitorBranchId)
            ?.name || "Selected branch"
        : "All branches",
      employees: buildSummary("employee"),
      students: buildSummary("student"),
    };
  }, [
    attendance,
    attendanceMonitorBranchId,
    attendanceMonitorDate,
    branches,
    users,
  ]);

  const leaveDecisionDetails = useMemo(() => {
    const month = previousMonthKey();
    return Object.fromEntries(
      leaves.map((leave) => {
        const user = users.find((item) => item.id === leave.userId);
        const branch = branches.find((item) => item.id === user?.branchId);
        const monthRecords = attendance.filter(
          (item) => item.userId === leave.userId && item.date.startsWith(month),
        );
        const presentDays = monthRecords.filter(
          (item) => item.status === "present",
        ).length;
        const attendancePercentage = monthRecords.length
          ? Math.round((presentDays / monthRecords.length) * 100)
          : 0;
        return [
          leave.id,
          {
            user,
            branch,
            month,
            presentDays,
            totalDays: monthRecords.length,
            attendancePercentage,
          },
        ];
      }),
    );
  }, [attendance, branches, leaves, users]);

  const visibleLeaves = useMemo(() => {
    if (canManage(session)) return leaves;
    const userId = mongoSessionUser?.id || session?.id || "";
    return leaves.filter((leave) => leave.userId === userId);
  }, [leaves, mongoSessionUser?.id, session]);

  const stats = useMemo(() => {
    const currentYear = new Date().getFullYear().toString();
    const presentDays = attendance.filter(
      (item) => item.status === "present",
    ).length;
    const absentDays = attendance.filter(
      (item) => item.status === "absent" || item.status === "invalid",
    ).length;
    return {
      users: users.length,
      branches: branches.length,
      employees: users.filter((user) =>
        ["employee", "branch_admin"].includes(effectiveRole(user.role)),
      ).length,
      students: users.filter((user) => user.role === "student").length,
      pendingLeaves: leaves.filter((leave) => leave.status === "pending")
        .length,
      openTasks: tasks.filter(
        (task) => !["completed", "rejected"].includes(task.status),
      ).length,
      completedTasks: tasks.filter((task) => task.status === "completed")
        .length,
      calendarItems: calendarEvents.length,
      holidays: companyHolidays.filter((holiday) =>
        holiday.date.startsWith(currentYear),
      ).length,
      payroll: payroll.length,
      regularization: regularization.filter(
        (item) => !["approved", "rejected"].includes(item.status),
      ).length,
      totalAttendance: attendance.length,
      presentDays,
      absentDays,
      attendancePercentage: attendance.length
        ? Math.round((presentDays / attendance.length) * 100)
        : 0,
      faceVerified: attendance.filter((item) => item.faceVerified).length,
      gpsVerified: attendance.filter((item) => item.gpsVerified).length,
    };
  }, [
    attendance,
    branches.length,
    calendarEvents.length,
    companyHolidays,
    leaves,
    payroll.length,
    regularization,
    tasks,
    users,
  ]);

  const personalDashboardStats = useMemo(() => {
    const userId = mongoSessionUser?.id || session?.id || "";
    const today = new Date().toISOString().slice(0, 10);
    const currentMonth = today.slice(0, 7);
    const todayRecord = attendance.find(
      (item) => item.userId === userId && item.date === today,
    );
    const scopedEvents = calendarEvents.filter((event) => {
      if (event.scope === "company") return true;
      if (event.scope === "branch")
        return (
          !!mongoSessionUser?.branchId &&
          event.branchId === mongoSessionUser.branchId
        );
      if (effectiveRole(mongoSessionUser?.role) === "student")
        return event.studentId === userId;
      return event.employeeId === userId;
    });
    const monthRecords = attendance.filter(
      (item) => item.userId === userId && item.date.startsWith(currentMonth),
    );
    const monthPresent = new Set(
      monthRecords
        .filter((item) => item.status === "present")
        .map((item) => item.date),
    ).size;
    const elapsedMonthDays = Number(today.slice(8, 10)) || 1;
    const upcomingEventList = scopedEvents
      .filter((event) => event.startDate >= today)
      .sort((first, second) => first.startDate.localeCompare(second.startDate))
      .slice(0, 4);
    return {
      todayPresent: todayRecord?.status === "present" ? 1 : 0,
      currentMonthAttendance: Math.min(
        100,
        Math.round((monthPresent / elapsedMonthDays) * 100),
      ),
      openTasks: tasks.filter(
        (task) =>
          task.assignedUserId === userId &&
          !["completed", "rejected"].includes(task.status),
      ).length,
      pendingLeaves: leaves.filter(
        (leave) => leave.userId === userId && leave.status === "pending",
      ).length,
      upcomingEvents: upcomingEventList.length,
      upcomingEventList,
    };
  }, [
    attendance,
    calendarEvents,
    leaves,
    mongoSessionUser,
    session?.id,
    tasks,
  ]);

  const sortedCompanyHolidays = useMemo(() => {
    return [...companyHolidays].sort((a, b) => a.date.localeCompare(b.date));
  }, [companyHolidays]);

  const upcomingCompanyHolidays = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return sortedCompanyHolidays
      .filter((holiday) => holiday.date >= today)
      .slice(0, 4);
  }, [sortedCompanyHolidays]);

  async function apiRequest<T>(path: string, options: RequestInit = {}) {
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    const token = localStorage.getItem(STORAGE_KEYS.token);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let response: Response;
    try {
      response = await fetchWithRetry(path, { ...options, headers });
    } catch {
      throw new Error(
        "Backend API is not reachable. Start the API server, then try again.",
      );
    }
    const text = await response.text();
    let data: { message?: string } = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      throw new Error(
        data.message ||
          `Request failed with status ${response.status}. Check that the API server is running.`,
      );
    }
    return data as T;
  }

  function toast(message: string, isError = false) {
    setNotice(message);
    setError(isError ? message : "");
    window.setTimeout(() => setNotice(""), 2800);
  }

  function handleUserPictureUpload(file: File | null) {
    if (!file) return;
    if (file.type !== "image/jpeg") {
      toast("Upload a JPG profile photo.", true);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast("Profile photo must be 2MB or smaller.", true);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setUserForm((current) => ({
        ...current,
        picture: String(reader.result || ""),
      }));
    };
    reader.onerror = () => toast("Unable to read the profile photo.", true);
    reader.readAsDataURL(file);
  }

  async function hydrateSession() {
    const token = localStorage.getItem(STORAGE_KEYS.token);
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const result = await apiRequest<{ user: User }>("/api/me");
      saveSession(result.user);
      await loadWorkspace(result.user);
    } catch {
      logout(false);
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(activeUser = session) {
    setWorkspaceLoading(true);
    setWorkspaceError("");
    try {
      const [
        usersData,
        branchesData,
        attendanceData,
        leavesData,
        taskData,
        calendarData,
        payrollData,
        reportsData,
        regularizationData,
        teamsData,
      ] = await Promise.all([
        mongoList<MongoUser>("users", { limit: 500 }).catch(() => ({
          users: [] as MongoUser[],
          total: 0,
          page: 1,
          limit: 500,
        })),
        mongoList<MongoBranch>("branches", { limit: 500 }).catch(() => ({
          branches: [] as MongoBranch[],
          total: 0,
          page: 1,
          limit: 500,
        })),
        mongoList<MongoAttendance>("attendances", {
          limit: 500,
          sort: "-date",
        }).catch(() => ({
          attendances: [] as MongoAttendance[],
          total: 0,
          page: 1,
          limit: 500,
        })),
        mongoList<MongoLeave>("leaves", {
          limit: 500,
          sort: "-createdAt",
        }).catch(() => ({
          leaves: [] as MongoLeave[],
          total: 0,
          page: 1,
          limit: 500,
        })),
        mongoList<MongoTask>("tasks", { limit: 500, sort: "-createdAt" }).catch(
          () => ({ tasks: [] as MongoTask[], total: 0, page: 1, limit: 500 }),
        ),
        mongoList<MongoCalendar>("calendars", {
          limit: 500,
          sort: "startDate",
        }).catch(() => ({
          calendars: [] as MongoCalendar[],
          total: 0,
          page: 1,
          limit: 500,
        })),
        mongoList<MongoPayroll>("payrolls", {
          limit: 500,
          sort: "-month",
        }).catch(() => ({
          payrolls: [] as MongoPayroll[],
          total: 0,
          page: 1,
          limit: 500,
        })),
        canManage(activeUser)
          ? mongoList<MongoReport>("reports", {
              limit: 100,
              sort: "-createdAt",
            }).catch(() => ({
              reports: [] as MongoReport[],
              total: 0,
              page: 1,
              limit: 100,
            }))
          : Promise.resolve({
              reports: [] as MongoReport[],
              total: 0,
              page: 1,
              limit: 100,
            }),
        mongoList<MongoRegularization>("attendance_regularizations", {
          limit: 500,
          sort: "-createdAt",
        }).catch(() => ({
          regularizations: [] as MongoRegularization[],
          total: 0,
          page: 1,
          limit: 500,
        })),
        apiRequest<{ teams: Team[] }>("/api/teams").catch(() => ({
          teams: [] as Team[],
        })),
      ]);
      const nextUsers = (usersData.users || []).map(mapMongoUser);
      const nextBranches = (branchesData.branches || []).map((branch) =>
        mapMongoBranch(branch, nextUsers),
      );
      const nextAttendance = (attendanceData.attendances || []).map((row) =>
        mapMongoAttendance(row, nextUsers),
      );
      const nextLeaves = (leavesData.leaves || []).map((row) =>
        mapMongoLeave(row, nextUsers),
      );
      const nextTasks = mapMongoTasks(taskData.tasks || [], nextUsers);
      const activeMongoUser =
        nextUsers.find((user) => user.email === activeUser?.email) || null;
      const payrollRows = payrollData.payrolls || [];
      const salaryMatchedPayrollRows = payrollRows.filter(
        (row) => Number(row.salary || 0) === Number(activeUser?.salary || 0),
      );
      const scopedPayrollRows = canManage(activeUser)
        ? payrollRows
        : activeMongoUser
          ? payrollRows.filter(
              (row) => String(row.userId || "") === activeMongoUser.id,
            )
          : salaryMatchedPayrollRows.length === 1
            ? salaryMatchedPayrollRows
            : payrollRows.length === 1
              ? payrollRows
              : [];
      const nextPayroll = scopedPayrollRows.map((row) =>
        mapMongoPayroll(
          row,
          nextUsers,
          canManage(activeUser) ? null : activeMongoUser || activeUser,
        ),
      );
      const nextEvents = (calendarData.calendars || []).map((event) =>
        mapMongoCalendar(event, nextUsers, nextBranches),
      );
      const nextRegularization = (regularizationData.regularizations || []).map(
        (item) => ({
          ...item,
          id: docId(item),
          userId: String(item.userId || ""),
          userName:
            nextUsers.find((user) => user.id === String(item.userId || ""))
              ?.name || "Unknown",
        }),
      );
      const latestMonthlyReport =
        reportsData.reports?.find((report) => report.month === reportMonth) ||
        reportsData.reports?.[0];

      setUsers(nextUsers);
      setBranches(nextBranches);
      setAttendance(nextAttendance);
      setLeaves(nextLeaves);
      setTasks(nextTasks);
      setTaskDrafts(
        Object.fromEntries(
          nextTasks.map((task) => [
            task.assignmentId,
            {
              status: task.status,
              progress: task.progress,
              remarks: task.remarks || "",
            },
          ]),
        ),
      );
      setCalendarEvents(nextEvents);
      setCalendarNotifications(
        nextEvents
          .filter(
            (event) => event.startDate >= new Date().toISOString().slice(0, 10),
          )
          .slice(0, 6),
      );
      setCompanyHolidays(
        mergeCompanyHolidays(
          nextEvents
            .map(calendarEventToHoliday)
            .filter((holiday): holiday is CompanyHoliday => !!holiday),
        ),
      );
      setPayroll(nextPayroll);
      setReports(
        branchReportsFromMongo(
          nextBranches,
          nextUsers,
          nextAttendance,
          nextLeaves,
        ),
      );
      setMonthlyReport(
        latestMonthlyReport?.totals
          ? {
              month: latestMonthlyReport.month || reportMonth,
              totals: latestMonthlyReport.totals,
              rows: latestMonthlyReport.rows || [],
            }
          : null,
      );
      setTeams(teamsData.teams || []);
      setRegularization(nextRegularization);
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Unable to load MongoDB workspace.";
      setWorkspaceError(message);
      toast(message, true);
    } finally {
      setWorkspaceLoading(false);
    }
  }

  function saveSession(user: User, token?: string) {
    setSession(user);
    localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user));
    if (token) localStorage.setItem(STORAGE_KEYS.token, token);
  }

  function clearSavedSession() {
    setSession(null);
    localStorage.removeItem(STORAGE_KEYS.user);
    localStorage.removeItem(STORAGE_KEYS.token);
  }

  async function completeLogin(result: SessionResponse) {
    if (!result.user || !result.token) {
      throw new Error(
        "Login succeeded but no session was returned. Restart the API server so the latest password-only login code is running.",
      );
    }
    saveSession(result.user, result.token);
    await loadWorkspace(result.user);
    setView("dashboard");
    toast(`Logged in as ${result.user.roleLabel || result.user.role}.`);
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      clearSavedSession();
      const result = await apiRequest<SessionResponse>("/api/login", {
        method: "POST",
        body: JSON.stringify({
          email: loginForm.email,
          password: loginForm.password,
          role: effectiveRole(loginForm.role),
        }),
      });
      await completeLogin(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Login failed.");
    }
  }

  async function requestPasswordReset() {
    try {
      const result = await apiRequest<{ message: string; resetToken?: string }>(
        "/api/forgot-password",
        {
          method: "POST",
          body: JSON.stringify({ email: resetEmail }),
        },
      );
      setResetToken(result.resetToken || "");
      toast(
        result.resetToken
          ? `Reset token: ${result.resetToken}`
          : result.message,
      );
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : "Unable to generate reset token.",
        true,
      );
    }
  }

  async function logout(withNotice = true) {
    try {
      if (localStorage.getItem(STORAGE_KEYS.token))
        await apiRequest("/api/logout", { method: "POST" });
    } catch {
      // The local session should still be cleared even if the server token already expired.
    }
    stopCamera();
    setSession(null);
    setUsers([]);
    setBranches([]);
    setAttendance([]);
    setLeaves([]);
    setReports([]);
    setTasks([]);
    setTeams([]);
    setCalendarEvents([]);
    setCalendarNotifications([]);
    setCompanyHolidays([]);
    setPayroll([]);
    setRegularization([]);
    setMonthlyReport(null);
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
    if (withNotice) toast("Logged out.");
  }

  function toggleTheme() {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(STORAGE_KEYS.theme, nextTheme);
  }

  async function saveHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session?.role !== "super_admin") {
      toast("Only Super Admin can manage holidays.", true);
      return;
    }
    const name = holidayForm.name.trim();
    if (!name || !holidayForm.date) {
      toast("Holiday name and date are required.", true);
      return;
    }
    try {
      const payload = {
        title: name,
        type:
          holidayForm.type === "National Holiday"
            ? ("national_holiday" as CalendarEventType)
            : ("government_holiday" as CalendarEventType),
        scope: "company" as const,
        startDate: holidayForm.date,
        endDate: holidayForm.date,
        description: `${holidayForm.type} | ${name}`,
        source: "custom",
      };
      if (editingHolidayId) {
        await mongoUpdate("calendars", editingHolidayId, payload);
      } else {
        await mongoCreate("calendars", payload);
      }
      setHolidayForm(emptyHolidayForm);
      setEditingHolidayId("");
      await loadWorkspace();
      toast(editingHolidayId ? "Holiday updated." : "Holiday added.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to save holiday.",
        true,
      );
    }
  }

  function editHoliday(holiday: CompanyHoliday) {
    if (holiday.source !== "custom") return;
    setHolidayForm({
      name: holiday.name,
      date: holiday.date,
      type: holiday.type,
    });
    setEditingHolidayId(holiday.id);
  }

  async function deleteHoliday(holiday: CompanyHoliday) {
    if (session?.role !== "super_admin" || holiday.source !== "custom") return;
    try {
      await mongoDelete("calendars", holiday.id);
      if (editingHolidayId === holiday.id) {
        setHolidayForm(emptyHolidayForm);
        setEditingHolidayId("");
      }
      await loadWorkspace();
      toast("Holiday deleted.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to delete holiday.",
        true,
      );
    }
  }

  async function addUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await mongoCreate("users", {
        ...userForm,
        passwordHash: userForm.password || "123456",
      });
      setUserForm(emptyUserForm);
      await loadWorkspace();
      toast("User created and assigned.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to add user.",
        true,
      );
    }
  }

  async function deleteUser(user: User) {
    try {
      await mongoDelete("users", user.id);
      await loadWorkspace();
      toast(`${user.name} removed.`);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to delete user.",
        true,
      );
    }
  }

  function startEditUser(user: User) {
    setEditingUserId(user.id);
    setUserEditForm({
      name: user.name || "",
      email: user.email || "",
      role: user.role || "employee",
      branchId: user.branchId || "",
      phone: user.phone || "",
      picture: user.picture || "",
      dob: dateInputValue(user.dob),
      dateOfJoining: dateInputValue(user.dateOfJoining),
      bankName: user.bankName || "",
      bankAccountNumber: user.bankAccountNumber || "",
      panNumber: user.panNumber || "",
      profile: user.profile || "",
      employeeId: user.employeeId || "",
      studentId: user.studentId || "",
      salary: user.salary ? String(user.salary) : "",
    });
  }

  async function updateUserProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingUserId) return;
    try {
      const payload = {
        ...userEditForm,
        dob: userEditForm.dob || undefined,
        dateOfJoining: userEditForm.dateOfJoining || undefined,
        branchId: userEditForm.branchId || undefined,
        bankName: userEditForm.bankName.trim(),
        bankAccountNumber: userEditForm.bankAccountNumber.trim(),
        panNumber: userEditForm.panNumber.trim().toUpperCase(),
        salary: userEditForm.salary ? Number(userEditForm.salary) : undefined,
      };
      await mongoUpdate("users", editingUserId, payload);
      setEditingUserId("");
      setUserEditForm(emptyUserEditForm);
      await loadWorkspace();
      toast("Profile updated.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to update profile.",
        true,
      );
    }
  }

  function startEditEmpDetails(user: User) {
    setEditingEmpDetailsId(user.id);
    setEmpDetailsForm({
      dateOfJoining: dateInputValue(user.dateOfJoining),
      bankName: user.bankName || "",
      bankAccountNumber: user.bankAccountNumber || "",
      panNumber: user.panNumber || "",
    });
  }

  async function updateEmpDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingEmpDetailsId) return;
    try {
      await mongoUpdate("users", editingEmpDetailsId, {
        dateOfJoining: empDetailsForm.dateOfJoining || undefined,
        bankName: empDetailsForm.bankName.trim(),
        bankAccountNumber: empDetailsForm.bankAccountNumber.trim(),
        panNumber: empDetailsForm.panNumber.trim().toUpperCase(),
      });
      setEditingEmpDetailsId("");
      setEmpDetailsForm(emptyEmpDetailsForm);
      await loadWorkspace();
      toast("Employee details updated.");
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : "Unable to update employee details.",
        true,
      );
    }
  }

  async function changeUserPassword(user: User) {
    if (session?.role !== "super_admin") {
      toast("Only Super Admin can change passwords.", true);
      return;
    }
    const password = String(passwordDrafts[user.id] || "");
    if (password.length < 6) {
      toast("Password must be at least 6 characters.", true);
      return;
    }
    try {
      await mongoUpdate("users", user.id, { password });
      setPasswordDrafts((current) => ({ ...current, [user.id]: "" }));
      await loadWorkspace();
      toast(`Password updated for ${displayName(user.name)}.`);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to update password.",
        true,
      );
    }
  }

  async function getLocationStamp(): Promise<LocationStamp> {
    if (!navigator.geolocation)
      throw new Error("GPS location is not supported on this device.");
    const position = await new Promise<GeolocationPosition>(
      (resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        });
      },
    ).catch((caught) => {
      const code = caught instanceof GeolocationPositionError ? caught.code : 0;
      if (code === 1)
        throw new Error(
          "GPS permission is blocked. Allow location access in Chrome site settings, then try again.",
        );
      if (code === 2)
        throw new Error(
          "GPS location is unavailable. Turn on device location and try again.",
        );
      if (code === 3)
        throw new Error(
          "GPS location timed out. Move near a window or try again.",
        );
      throw new Error("Unable to read GPS location.");
    });
    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      address: `GPS ${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`,
    };
  }

  async function addBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await mongoCreate("branches", branchForm);
      setBranchForm(emptyBranchForm);
      await loadWorkspace();
      toast("Branch added.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to add branch.",
        true,
      );
    }
  }

  function startEditBranch(branch: Branch) {
    setEditingBranchId(branch.id);
    setBranchEditForm({
      name: branch.name || "",
      code: branch.code || "",
      address: branch.address || "",
      manager: branch.manager || "",
      contactEmail: branch.contactEmail || "",
      contactPhone: branch.contactPhone || "",
    });
  }

  async function updateBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingBranchId) return;
    try {
      await mongoUpdate("branches", editingBranchId, branchEditForm);
      setEditingBranchId("");
      setBranchEditForm(emptyBranchForm);
      await loadWorkspace();
      toast("Branch updated.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to update branch.",
        true,
      );
    }
  }

  async function deleteBranch(branch: Branch) {
    try {
      await mongoDelete("branches", branch.id);
      await loadWorkspace();
      toast(`${branch.name} deleted.`);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to delete branch.",
        true,
      );
    }
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast(
        "Camera access is available only in a supported browser on localhost or HTTPS.",
        true,
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOn(true);
      window.setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 0);
      toast("Camera access granted.");
    } catch (caught) {
      const errorName = caught instanceof DOMException ? caught.name : "";
      const message =
        errorName === "NotAllowedError" || errorName === "PermissionDeniedError"
          ? "Camera permission is blocked. Allow camera access in your browser settings, then try again."
          : errorName === "NotFoundError" ||
              errorName === "DevicesNotFoundError"
            ? "No camera was found on this device."
            : "Unable to start the camera. Check browser permissions and try again.";
      toast(message, true);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  useEffect(() => {
    const savedTheme =
      (localStorage.getItem(STORAGE_KEYS.theme) as Theme | null) || "light";
    document.documentElement.dataset.theme = savedTheme;
    const savedUser = localStorage.getItem(STORAGE_KEYS.user);
    const hydrationFrame = window.requestAnimationFrame(() => {
      setTheme(savedTheme);
      if (savedUser) setSession(JSON.parse(savedUser));
      void hydrateSession();
    });
    return () => {
      window.cancelAnimationFrame(hydrationFrame);
      stopCamera();
    };
    // The session bootstrap intentionally runs once when the client mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    if (session && canManage(session)) {
      void serviceApiRequest<AnalyticsData>("/api/analytics/dashboard")
        .then((data) => {
          if (active) setAnalytics(data);
        })
        .catch(() => {
          if (active) setAnalytics(null);
        });
    }
    return () => {
      active = false;
    };
  }, [session]);

  function captureFrame() {
    const video = videoRef.current;
    if (!video) return "";
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    canvas
      .getContext("2d")
      ?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  async function captureFaceRegistrationSample() {
    const video = videoRef.current;
    if (!video || !cameraOn) {
      toast("Start the camera before capturing face samples.", true);
      return;
    }
    try {
      setVerificationBusy(true);
      const sample = await captureFaceSample(
        video,
        nextFaceSampleLabel(faceSamples.length),
      );
      setFaceSamples([...faceSamples, sample].slice(0, 10));
      toast(`Captured ${sample.label} face sample.`);
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : "Unable to capture face sample.",
        true,
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  async function saveFaceRegistration() {
    if (!mongoSessionUser?.id) {
      toast("MongoDB user profile is not loaded for this session.", true);
      return;
    }
    if (faceSamples.length < 3) {
      toast("Capture at least 3 face samples before registering.", true);
      return;
    }
    try {
      setVerificationBusy(true);
      await registerFaceProfile(mongoSessionUser.id, faceSamples);
      setFaceSamples([]);
      await loadWorkspace();
      toast("Face profile registered.");
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : "Unable to register face profile.",
        true,
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  async function markAttendance(type: "clock-in" | "clock-out") {
    try {
      if (!mongoSessionUser?.id)
        throw new Error("MongoDB user profile is not loaded for this session.");
      const video = videoRef.current;
      if (!video || !cameraOn)
        throw new Error("Start the camera before marking attendance.");
      setVerificationBusy(true);
      const liveness = await runLivenessChallenge(video, setLivenessPrompt);
      const imageData = captureFrame();
      const embedding = await captureFaceSample(video, "live");
      const location = await getLocationStamp();
      const result = await clockAttendance(
        type === "clock-in" ? "clockin" : "clockout",
        {
          userId: mongoSessionUser.id,
          imageData,
          embedding: embedding.vector,
          livenessChallenge: liveness.challenge,
          livenessVerified: liveness.livenessVerified,
          gps: { ...location, capturedAt: new Date().toISOString() },
          browserFingerprint: await browserFingerprint(),
          deviceInfo: deviceInfo(),
        },
      );
      await loadWorkspace();
      toast(
        result.approved
          ? type === "clock-in"
            ? "Clock-in recorded."
            : "Clock-out recorded."
          : result.message,
        !result.approved,
      );
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Attendance failed.",
        true,
      );
    } finally {
      setVerificationBusy(false);
      setLivenessPrompt("");
    }
  }

  async function applyLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!mongoSessionUser?.id)
        throw new Error("MongoDB user profile is not loaded for this session.");
      await mongoCreate("leaves", {
        ...leaveForm,
        userId: mongoSessionUser.id,
        branchId: mongoSessionUser.branchId || undefined,
        status: "pending",
      });
      setLeaveForm(emptyLeaveForm);
      await loadWorkspace();
      toast("Leave request submitted.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to apply leave.",
        true,
      );
    }
  }

  async function decideLeave(leave: Leave, status: "approved" | "rejected") {
    await mongoUpdate("leaves", leave.id, {
      status,
      decidedBy: mongoSessionUser?.id,
      decidedAt: new Date().toISOString(),
    });
    await loadWorkspace();
    toast(`Leave ${status}.`);
  }

  async function assignTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!mongoSessionUser?.id)
        throw new Error("MongoDB user profile is not loaded for this session.");
      const selectedTeam = teams.find((team) => team.id === taskForm.teamId);
      const assignedUserIds =
        selectedTeam?.members.map((member) => member.userId) ||
        (taskForm.assignedUserId ? [taskForm.assignedUserId] : []);
      await mongoCreate("tasks", {
        title: taskForm.title,
        description: taskForm.description,
        branchId: mongoSessionUser.branchId || undefined,
        priority: taskForm.priority,
        deadline: taskForm.deadline,
        assignmentType: selectedTeam ? "team" : "individual",
        teamName: selectedTeam?.name || undefined,
        assignedBy: mongoSessionUser.id,
        assignments: assignedUserIds.map((userId) => ({
          userId,
          status: "pending",
          progress: 0,
          remarks: "",
        })),
      });
      setTaskForm(emptyTaskForm);
      await loadWorkspace();
      toast("Task assigned.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to assign task.",
        true,
      );
    }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const result = await apiRequest<{ team: Team }>("/api/teams", {
        method: "POST",
        body: JSON.stringify(teamForm),
      });
      if (result.team) {
        const members = teamForm.memberIds.map((userId) => {
          const user = users.find((item) => item.id === userId);
          return {
            userId,
            name: user?.name || "Unknown",
            role: user?.role || ("employee" as Role),
          };
        });
        setTeams((current) => [
          ...current.filter((team) => team.id !== result.team.id),
          { ...result.team, members },
        ]);
      }
      setTeamForm(emptyTeamForm);
      toast("Team created.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to create team.",
        true,
      );
    }
  }

  async function updateTask(task: TaskItem) {
    const draft = taskDrafts[task.assignmentId];
    if (!draft) return;
    try {
      const assignments = tasks
        .filter((item) => item.id === task.id)
        .map((item) => ({
          _id: item.assignmentId,
          userId: item.assignedUserId,
          status:
            item.assignmentId === task.assignmentId
              ? draft.status
              : item.status,
          progress:
            item.assignmentId === task.assignmentId
              ? draft.progress
              : item.progress,
          remarks:
            item.assignmentId === task.assignmentId
              ? draft.remarks
              : item.remarks || "",
        }));
      await mongoUpdate("tasks", task.id, { assignments });
      await loadWorkspace();
      toast("Task updated.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to update task.",
        true,
      );
    }
  }

  async function addCalendarEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await mongoCreate("calendars", {
        ...calendarForm,
        scope: calendarForm.studentId
          ? "student"
          : calendarForm.employeeId
            ? "employee"
            : calendarForm.branchId
              ? "branch"
              : "company",
        branchId: calendarForm.branchId || undefined,
        employeeId: calendarForm.employeeId || undefined,
        studentId: calendarForm.studentId || undefined,
        endDate: calendarForm.endDate || calendarForm.startDate,
      });
      setCalendarForm(emptyCalendarForm);
      await loadWorkspace();
      toast("Calendar item added.");
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : "Unable to add calendar item.",
        true,
      );
    }
  }

  async function deleteCalendarEvent(event: CalendarEvent) {
    try {
      await mongoDelete("calendars", event.id);
      await loadWorkspace();
      toast("Calendar item deleted.");
    } catch (caught) {
      toast(
        caught instanceof Error
          ? caught.message
          : "Unable to delete calendar item.",
        true,
      );
    }
  }

  async function loadMonthlyReport(month = reportMonth) {
    try {
      await loadWorkspace();
      const monthlyAttendance = attendance.filter((item) =>
        item.date.startsWith(month),
      );
      const monthlyTasks = tasks.filter((task) =>
        (task.assignedAt || task.deadline || "").startsWith(month),
      );
      const monthlyLeaves = leaves.filter(
        (leave) =>
          leave.fromDate.startsWith(month) || leave.toDate.startsWith(month),
      );
      const monthlyPayroll = payroll.filter((row) => row.month === month);
      const rows = users
        .filter((user) =>
          ["branch_admin", "employee", "student"].includes(
            effectiveRole(user.role),
          ),
        )
        .map((user) => {
          const userTasks = monthlyTasks.filter(
            (task) => task.assignedUserId === user.id,
          );
          const completedTasks = userTasks.filter(
            (task) => task.status === "completed",
          ).length;
          const attendanceDays = monthlyAttendance.filter(
            (item) => item.userId === user.id && item.status === "present",
          ).length;
          const netPay =
            monthlyPayroll.find((row) => row.userId === user.id)?.netPay || 0;
          return {
            employeeId: user.employeeId || user.studentId || user.id,
            employeeName: user.name,
            role: user.role,
            attendanceDays,
            attendancePercentage: attendanceDays
              ? Math.round((attendanceDays / 26) * 100)
              : 0,
            completedTasks,
            totalTasks: userTasks.length,
            completionRate: userTasks.length
              ? Math.round((completedTasks / userTasks.length) * 100)
              : 0,
            averageProgress: userTasks.length
              ? Math.round(
                  userTasks.reduce((sum, task) => sum + task.progress, 0) /
                    userTasks.length,
                )
              : 0,
            leaveRequests: monthlyLeaves.filter(
              (leave) => leave.userId === user.id,
            ).length,
            netPay,
          };
        });
      const nextReport: MonthlyReport = {
        month,
        totals: {
          employees: users.filter((user) =>
            ["branch_admin", "employee"].includes(effectiveRole(user.role)),
          ).length,
          students: users.filter((user) => user.role === "student").length,
          attendanceRecords: monthlyAttendance.length,
          assignedTasks: monthlyTasks.length,
          completedTasks: monthlyTasks.filter(
            (task) => task.status === "completed",
          ).length,
          overdueTasks: monthlyTasks.filter(
            (task) =>
              task.deadline < new Date().toISOString().slice(0, 10) &&
              task.status !== "completed",
          ).length,
          leaveRequests: monthlyLeaves.length,
          payrollProcessed: monthlyPayroll.length,
          payrollNetPay: monthlyPayroll.reduce(
            (sum, row) => sum + row.netPay,
            0,
          ),
        },
        rows,
      };
      setMonthlyReport(nextReport);
      if (canManage(session)) {
        const existing = await mongoList<MongoReport>("reports", {
          reportType: "monthly",
          month,
          limit: 1,
        }).catch(() => ({
          reports: [] as MongoReport[],
          total: 0,
          page: 1,
          limit: 1,
        }));
        const payload = {
          reportType: "monthly",
          month,
          totals: nextReport.totals,
          rows: nextReport.rows,
        };
        if (existing.reports?.[0]?._id) {
          await mongoUpdate("reports", existing.reports[0]._id, payload);
        } else {
          await mongoCreate("reports", payload);
        }
      }
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to load report.",
        true,
      );
    }
  }

  async function processPayroll() {
    try {
      if (!mongoSessionUser?.id)
        throw new Error("MongoDB user profile is not loaded for this session.");
      if (!payrollBranchId)
        throw new Error("Select a branch before processing payroll.");
      const payrollUsers = users.filter(
        (user) =>
          user.branchId === payrollBranchId &&
          ["branch_admin", "employee"].includes(effectiveRole(user.role)),
      );
      if (!payrollUsers.length)
        throw new Error("No payroll members found in the selected branch.");
      await Promise.all(
        payrollUsers.map((user) => {
          const salary = Number(user.salary || 0);
          const existing = payroll.find(
            (row) => row.userId === user.id && row.month === reportMonth,
          );
          const payload = {
            userId: user.id,
            branchId: user.branchId || undefined,
            month: reportMonth,
            salary,
            basicSalary: salary,
            grossSalary: salary,
            totalDeductions: 0,
            bonus: 0,
            netPay: salary,
            processedBy: mongoSessionUser.id,
            processedAt: new Date().toISOString(),
          };
          return existing
            ? mongoUpdate("payrolls", existing.id, payload)
            : mongoCreate("payrolls", payload);
        }),
      );
      await loadWorkspace();
      await loadMonthlyReport(reportMonth);
      toast(
        `Payroll processed for ${branches.find((branch) => branch.id === payrollBranchId)?.name || "selected branch"}.`,
      );
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to process payroll.",
        true,
      );
    }
  }

  async function downloadPayslip(row: PayrollRow) {
    const token = localStorage.getItem(STORAGE_KEYS.token);
    const response = await fetch(`/api/payroll/${row.id}/payslip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      toast("Unable to download payslip.", true);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payslip-${row.month}-${row.employeeId}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function submitRegularization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!mongoSessionUser?.id)
        throw new Error("MongoDB user profile is not loaded for this session.");
      await mongoCreate("attendance_regularizations", {
        ...regularizationForm,
        userId: mongoSessionUser.id,
        branchId: mongoSessionUser.branchId || undefined,
        status: "pending",
      });
      setRegularizationForm(emptyRegularizationForm);
      await loadWorkspace();
      toast("Regularization request submitted.");
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to submit request.",
        true,
      );
    }
  }

  async function decideRegularization(
    request: RegularizationRequest,
    decision: "approved" | "rejected",
  ) {
    try {
      const path =
        session?.role === "super_admin"
          ? `/api/regularizations/${request.id}/super-decision`
          : `/api/regularizations/${request.id}/branch-decision`;
      await apiRequest(path, {
        method: "PUT",
        body: JSON.stringify({ decision }),
      });
      await loadWorkspace();
      toast(`Regularization ${decision}.`);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to update request.",
        true,
      );
    }
  }

  async function exportMonthlyReport(format: "pdf" | "excel") {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.token);
      const response = await fetch(
        `/api/exports/${reportType}/${format === "pdf" ? "pdf" : "excel"}?month=${reportMonth}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${reportType}-${reportMonth}.${format === "pdf" ? "pdf" : "csv"}`;
      link.click();
      URL.revokeObjectURL(url);
      toast(`${format === "pdf" ? "PDF" : "Excel"} report exported.`);
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "Unable to export report.",
        true,
      );
    }
  }

  if (loading) {
    return (
      <main className="loading-screen">
        <div className="brand-mark logo-mark">
          <Image
            className="brand-logo"
            src="/assets/job-way-tech-logo.png"
            alt="JobWayTech logo"
            width={44}
            height={44}
            priority
          />
        </div>
        <p>Preparing portal...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="auth-page">
        <section className="auth-visual" aria-label="Portal overview">
          <div className="welcome-copy">
            <div className="auth-hero-logo">
              <Image
                className="auth-hero-logo-image"
                src="/assets/job-way-tech-logo.png"
                alt="JobWayTech logo"
                width={220}
                height={220}
                priority
              />
              <div>
                <strong>JobWayTech</strong>
                <span>Authentication and operations portal</span>
                <address>
                  429-A-24, Indira Nagar, Krishna Nagar, Madanapalle, Andhra
                  Pradesh - 517325
                </address>
              </div>
            </div>
            <p>
              A focused workspace for admins, employees, and students with
              attendance, tasks, branches, approvals, and reports.
            </p>
            <div className="auth-trust-row">
              <span>Role based</span>
              <span>Face + GPS ready</span>
              <span>Branch scoped</span>
            </div>
          </div>
          <div className="floating-grid">
            <article>
              <Users />
              <strong>Role access</strong>
              <span>Admin, employee, and student workspaces</span>
            </article>
            <article>
              <Building2 />
              <strong>Branch control</strong>
              <span>Teams, tasks, reports, and attendance</span>
            </article>
            <article>
              <Camera />
              <strong>Smart check-in</strong>
              <span>Face and GPS attendance verification</span>
            </article>
          </div>
        </section>

        <section className="auth-card auth-login-card">
          <div className="section-title login-title">
            <div className="login-icon">
              <LockKeyhole />
            </div>
            <div>
              <span>Welcome back</span>
              <h2>Open your portal</h2>
              <p>Select your role and continue to your workspace.</p>
            </div>
          </div>
          <form className="form" onSubmit={handleLogin}>
            <label>
              Login as
              <details className="role-select">
                <summary>
                  {ROLE_OPTIONS.find((role) => role.value === loginForm.role)
                    ?.label || "Select role"}
                </summary>
                <div className="role-options">
                  {ROLE_OPTIONS.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      className={loginForm.role === role.value ? "active" : ""}
                      onClick={(event) => {
                        setLoginForm({ ...loginForm, role: role.value });
                        event.currentTarget
                          .closest("details")
                          ?.removeAttribute("open");
                      }}
                    >
                      <span>{role.label}</span>
                      {loginForm.role === role.value ? <Check /> : null}
                    </button>
                  ))}
                </div>
              </details>
            </label>
            <label>
              Email address
              <input
                type="email"
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm({ ...loginForm, email: event.target.value })
                }
                required
              />
            </label>
            <label>
              Password
              <div className="password-input">
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginForm.password}
                  onChange={(event) =>
                    setLoginForm({ ...loginForm, password: event.target.value })
                  }
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password"
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button auth-submit-button" type="submit">
              <LockKeyhole /> Open portal
            </button>
          </form>

          <div className="reset-box">
            <input
              value={resetEmail}
              onChange={(event) => setResetEmail(event.target.value)}
              placeholder="Forgot password email"
            />
            <button
              className="ghost-button"
              type="button"
              onClick={requestPasswordReset}
            >
              Generate reset
            </button>
            {resetToken ? <small>{resetToken}</small> : null}
          </div>
        </section>
      </main>
    );
  }

  const navItems = [
    {
      id: "dashboard" as View,
      label: "Dashboard",
      icon: LayoutDashboard,
      show: true,
    },
    {
      id: "users" as View,
      label: "Users",
      icon: Users,
      show: canManage(session),
    },
    {
      id: "branches" as View,
      label: "Branches",
      icon: Building2,
      show: canManage(session),
    },
    {
      id: "emp-details" as View,
      label: "Emp details",
      icon: IdCard,
      show: effectiveRole(session.role) !== "student",
    },
    { id: "attendance" as View, label: "Attendance", icon: Camera, show: true },
    { id: "leaves" as View, label: "Leaves", icon: CalendarCheck, show: true },
    { id: "tasks" as View, label: "Tasks", icon: ClipboardList, show: true },
    {
      id: "calendar" as View,
      label: "Calendar",
      icon: CalendarDays,
      show: true,
    },
    {
      id: "payroll" as View,
      label: "Payroll",
      icon: WalletCards,
      show: effectiveRole(session.role) !== "student",
    },
    {
      id: "regularization" as View,
      label: "Regularize",
      icon: MapPin,
      show: effectiveRole(session.role) !== "student",
    },
    {
      id: "reports" as View,
      label: "Reports",
      icon: FileSpreadsheet,
      show: canManage(session),
    },
    {
      id: "security" as View,
      label: "Security",
      icon: ShieldCheck,
      show: true,
    },
  ].filter((item) => item.show);

  return (
    <main className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <div className="brand-row">
          <div className="brand-mark logo-mark">
            <Image
              className="brand-logo"
              src="/assets/job-way-tech-logo.png"
              alt="JobWayTech logo"
              width={44}
              height={44}
              priority
            />
          </div>
          <div>
            <strong>JobWayTech</strong>
            <span>{session.roleLabel || session.role}</span>
          </div>
        </div>
        <span className="sidebar-section-label">Workspace</span>
        <nav className="side-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "active" : ""}
                onClick={() => {
                  setView(item.id);
                  setMenuOpen(false);
                }}
              >
                <Icon />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-card">
          <div>
            <ShieldCheck />
            <strong>Access scoped</strong>
          </div>
          <span>
            {canManage(session)
              ? "Admin controls enabled for your role."
              : "Your workspace is limited to your profile."}
          </span>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
          <div className="profile-strip">
            <div className="avatar">{initials(displayName(session.name))}</div>
            <div>
              <strong>{displayName(session.name)}</strong>
              <span>{session.email}</span>
            </div>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun /> : <Moon />}
            </button>
            <button className="ghost-button" onClick={() => logout()}>
              <LogOut /> Logout
            </button>
          </div>
        </header>

        {workspaceLoading ? (
          <p className="demo-note">Loading MongoDB workspace data...</p>
        ) : null}
        {workspaceError ? (
          <div className="form-error">
            {workspaceError}
            <button
              className="ghost-button"
              type="button"
              onClick={() => loadWorkspace()}
            >
              Retry
            </button>
          </div>
        ) : null}

        {view === "dashboard" ? (
          <section className="welcome-dashboard">
            <div className="hero-panel dashboard-hero">
              <div className="dashboard-hero-copy">
                <span className="eyebrow">
                  <FileBarChart /> Portal overview
                </span>
                <h1>Welcome, {firstName(session.name)}.</h1>
                <p>
                  {canManage(session)
                    ? "Review organization totals, branch activity, and reports from one place."
                    : "Track your attendance, assigned work, leave requests, and upcoming calendar items."}
                </p>
                <div className="hero-meta-row">
                  <span>
                    {canManage(session)
                      ? "Admin workspace"
                      : "Personal workspace"}
                  </span>
                  <span>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                    }).format(new Date())}
                  </span>
                </div>
              </div>
              {canManage(session) ? (
                <div className="system-card dashboard-status-card">
                  <div>
                    <Check />
                    <span>Verified access</span>
                  </div>
                  <strong>Secure session</strong>
                  <span>
                    JWT token, session record, and role scope verified.
                  </span>
                </div>
              ) : (
                <HeroProfileCard user={mongoSessionUser} />
              )}
            </div>
            {!canManage(session) ? (
              <div className="stats-grid personal-dashboard-grid">
                <PersonalStat
                  label="Today Present"
                  value={personalDashboardStats.todayPresent}
                  icon={<UserCheck />}
                  tone="teal"
                />
                <PersonalStat
                  label="Monthly Attendance"
                  value={`${personalDashboardStats.currentMonthAttendance}%`}
                  icon={<Percent />}
                  tone="blue"
                />
                <PersonalStat
                  label="Open Tasks"
                  value={personalDashboardStats.openTasks}
                  icon={<ClipboardList />}
                  tone="indigo"
                />
                <PersonalStat
                  label="Pending Leaves"
                  value={personalDashboardStats.pendingLeaves}
                  icon={<CalendarCheck />}
                  tone="amber"
                />
                <PersonalStat
                  label="Upcoming Events"
                  value={personalDashboardStats.upcomingEvents}
                  icon={<CalendarDays />}
                  tone="cyan"
                />
              </div>
            ) : null}
            {!canManage(session) ? (
              <section className="holiday-widget personal-events-widget">
                <div className="task-card-head">
                  <div>
                    <strong>Upcoming events</strong>
                    <span>
                      Events linked to your branch, profile, or company calendar
                    </span>
                  </div>
                  <span className="pill company_holiday">Calendar</span>
                </div>
                <div className="holiday-widget-list">
                  {personalDashboardStats.upcomingEventList.map((event) => (
                    <article key={event.id}>
                      <strong>{event.title}</strong>
                      <span>
                        {event.startDate}
                        {event.startTime ? ` at ${event.startTime}` : ""}
                      </span>
                      <span className={`pill ${event.type}`}>
                        {CALENDAR_TYPE_OPTIONS.find(
                          (item) => item.value === event.type,
                        )?.label || "Event"}
                      </span>
                    </article>
                  ))}
                  {!personalDashboardStats.upcomingEventList.length ? (
                    <p>No upcoming events assigned.</p>
                  ) : null}
                </div>
              </section>
            ) : null}
            {canManage(session) && analytics ? (
              <AnalyticsPanel analytics={analytics} stats={stats} />
            ) : null}
            {canManage(session) && reports.length ? (
              <ReportsPanel reports={reports} />
            ) : null}
            <section className="holiday-widget dashboard-holidays">
              <div className="task-card-head dashboard-section-head">
                <div>
                  <strong>Upcoming holidays</strong>
                  <span>
                    {stats.holidays} government{" "}
                    {stats.holidays === 1 ? "holiday" : "holidays"} in{" "}
                    {new Date().getFullYear()}
                  </span>
                </div>
                <span className="pill national_holiday">National Holidays</span>
              </div>
              <div className="holiday-widget-list">
                {upcomingCompanyHolidays.map((holiday) => (
                  <article key={holiday.id}>
                    <strong>{holiday.name}</strong>
                    <span>{formatDate(holiday.date)}</span>
                    <span
                      className={`pill ${holiday.type === "National Holiday" ? "national_holiday" : "government_holiday"}`}
                    >
                      {holiday.type}
                    </span>
                  </article>
                ))}
                {!upcomingCompanyHolidays.length ? (
                  <p>No upcoming holidays for this year.</p>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}

        {view === "users" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h1>User management</h1>
                <p>Create role-based accounts and assign them to branches.</p>
              </div>
              <label className="search-box">
                <Search />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search users"
                />
              </label>
            </div>
            <form className="inline-form" onSubmit={addUser}>
              <input
                value={userForm.name}
                onChange={(event) =>
                  setUserForm({ ...userForm, name: event.target.value })
                }
                placeholder="Full name"
                required
              />
              <input
                type="email"
                value={userForm.email}
                onChange={(event) =>
                  setUserForm({ ...userForm, email: event.target.value })
                }
                placeholder="Email"
                required
              />
              <input
                type="password"
                value={userForm.password}
                onChange={(event) =>
                  setUserForm({ ...userForm, password: event.target.value })
                }
                placeholder="Password"
                required
              />
              <select
                value={userForm.role}
                onChange={(event) =>
                  setUserForm({ ...userForm, role: event.target.value as Role })
                }
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
              <select
                value={userForm.branchId}
                onChange={(event) =>
                  setUserForm({ ...userForm, branchId: event.target.value })
                }
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <input
                value={userForm.phone}
                onChange={(event) =>
                  setUserForm({ ...userForm, phone: event.target.value })
                }
                placeholder="Phone"
              />
              <input
                value={userForm.employeeId}
                onChange={(event) =>
                  setUserForm({ ...userForm, employeeId: event.target.value })
                }
                placeholder="EMP ID"
              />
              <label className="file-upload-field">
                <span>
                  {userForm.picture ? "Photo selected" : "Upload JPG"}
                </span>
                <input
                  type="file"
                  accept="image/jpeg,.jpg,.jpeg"
                  onChange={(event) =>
                    handleUserPictureUpload(event.target.files?.[0] || null)
                  }
                />
              </label>
              <label className="field-label">
                <span>DOB</span>
                <input
                  type="date"
                  value={userForm.dob}
                  onChange={(event) =>
                    setUserForm({ ...userForm, dob: event.target.value })
                  }
                />
              </label>
              <label className="field-label">
                <span>Date of joining</span>
                <input
                  type="date"
                  value={userForm.dateOfJoining}
                  onChange={(event) =>
                    setUserForm({
                      ...userForm,
                      dateOfJoining: event.target.value,
                    })
                  }
                />
              </label>
              <input
                value={userForm.bankName}
                onChange={(event) =>
                  setUserForm({ ...userForm, bankName: event.target.value })
                }
                placeholder="Bank name"
              />
              <input
                value={userForm.bankAccountNumber}
                onChange={(event) =>
                  setUserForm({
                    ...userForm,
                    bankAccountNumber: event.target.value,
                  })
                }
                placeholder="Bank account number"
              />
              <input
                value={userForm.panNumber}
                onChange={(event) =>
                  setUserForm({
                    ...userForm,
                    panNumber: event.target.value.toUpperCase(),
                  })
                }
                placeholder="PAN number"
              />
              <select
                value={userForm.profile}
                onChange={(event) =>
                  setUserForm({ ...userForm, profile: event.target.value })
                }
              >
                <option value="">Roles</option>
                {PROFILE_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
              <button className="primary-button compact" type="submit">
                <UserPlus /> Add
              </button>
            </form>
            <div className="user-grid">
              {filteredUsers.map((user) => (
                <article className="user-card" key={user.id}>
                  <div className="card-topline">
                    <div className="user-main">
                      <div
                        className="avatar user-photo-avatar"
                        style={
                          user.picture
                            ? { backgroundImage: `url(${user.picture})` }
                            : undefined
                        }
                      >
                        {!user.picture
                          ? initials(displayName(user.name))
                          : null}
                      </div>
                      <div>
                        <strong>{displayName(user.name)}</strong>
                        <span>{user.email}</span>
                      </div>
                    </div>
                    <details className="card-action-menu">
                      <summary aria-label={`Open actions for ${user.name}`}>
                        <MoreVertical />
                      </summary>
                      <div className="card-action-list">
                        <button
                          type="button"
                          onClick={() => startEditUser(user)}
                        >
                          <Pencil /> Edit profile
                        </button>
                        <button
                          type="button"
                          className="danger-menu-item"
                          disabled={user.id === session.id}
                          onClick={() => deleteUser(user)}
                        >
                          <Trash2 /> Delete
                        </button>
                      </div>
                    </details>
                  </div>
                  <div className="user-meta">
                    <span className={`pill ${user.role}`}>
                      {user.roleLabel || user.role}
                    </span>
                    <span>
                      {branches.find((branch) => branch.id === user.branchId)
                        ?.name || "No branch"}
                    </span>
                    <span>
                      {user.employeeId || user.studentId || "Profile pending"}
                    </span>
                    <span>
                      {user.dob ? `DOB ${formatDate(user.dob)}` : "DOB not set"}
                    </span>
                  </div>
                  {editingUserId === user.id ? (
                    <form
                      className="card-edit-form user-edit-form"
                      onSubmit={updateUserProfile}
                    >
                      <input
                        value={userEditForm.name}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            name: event.target.value,
                          })
                        }
                        placeholder="Name"
                        required
                      />
                      <input
                        type="email"
                        value={userEditForm.email}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            email: event.target.value,
                          })
                        }
                        placeholder="Email"
                        required
                      />
                      <select
                        value={userEditForm.role}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            role: event.target.value as Role,
                          })
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role.value} value={role.value}>
                            {role.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={userEditForm.branchId}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            branchId: event.target.value,
                          })
                        }
                      >
                        <option value="">No branch</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                      <input
                        value={userEditForm.employeeId}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            employeeId: event.target.value,
                          })
                        }
                        placeholder="Employee ID"
                      />
                      <input
                        value={userEditForm.studentId}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            studentId: event.target.value,
                          })
                        }
                        placeholder="Student ID"
                      />
                      <label className="field-label">
                        <span>DOB</span>
                        <input
                          type="date"
                          value={userEditForm.dob}
                          onChange={(event) =>
                            setUserEditForm({
                              ...userEditForm,
                              dob: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field-label">
                        <span>Date of joining</span>
                        <input
                          type="date"
                          value={userEditForm.dateOfJoining}
                          onChange={(event) =>
                            setUserEditForm({
                              ...userEditForm,
                              dateOfJoining: event.target.value,
                            })
                          }
                        />
                      </label>
                      <input
                        value={userEditForm.bankName}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            bankName: event.target.value,
                          })
                        }
                        placeholder="Bank name"
                      />
                      <input
                        value={userEditForm.bankAccountNumber}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            bankAccountNumber: event.target.value,
                          })
                        }
                        placeholder="Bank account number"
                      />
                      <input
                        value={userEditForm.panNumber}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            panNumber: event.target.value.toUpperCase(),
                          })
                        }
                        placeholder="PAN number"
                      />
                      <select
                        value={userEditForm.profile}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            profile: event.target.value,
                          })
                        }
                      >
                        <option value="">Profile role</option>
                        {PROFILE_ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <input
                        value={userEditForm.phone}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            phone: event.target.value,
                          })
                        }
                        placeholder="Phone"
                      />
                      <input
                        type="number"
                        value={userEditForm.salary}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            salary: event.target.value,
                          })
                        }
                        placeholder="Salary"
                      />
                      <input
                        className="wide-field"
                        value={userEditForm.picture}
                        onChange={(event) =>
                          setUserEditForm({
                            ...userEditForm,
                            picture: event.target.value,
                          })
                        }
                        placeholder="Photo URL"
                      />
                      <div className="card-edit-actions">
                        <button className="primary-button compact" type="submit">
                          <Save /> Save
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => {
                            setEditingUserId("");
                            setUserEditForm(emptyUserEditForm);
                          }}
                        >
                          <X /> Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                  {session.role === "super_admin" ? (
                    <div className="reset-box user-password-reset">
                      <input
                        type="password"
                        value={passwordDrafts[user.id] || ""}
                        onChange={(event) =>
                          setPasswordDrafts((current) => ({
                            ...current,
                            [user.id]: event.target.value,
                          }))
                        }
                        placeholder="New password"
                        autoComplete="new-password"
                      />
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => changeUserPassword(user)}
                      >
                        <LockKeyhole /> Change
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {view === "branches" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h1>Branch management</h1>
                <p>
                  Add branches, review branch strength, and delete empty
                  branches.
                </p>
              </div>
            </div>
            {session.role === "super_admin" ? (
              <form className="inline-form branch-form" onSubmit={addBranch}>
                <input
                  value={branchForm.name}
                  onChange={(event) =>
                    setBranchForm({ ...branchForm, name: event.target.value })
                  }
                  placeholder="Branch name"
                  required
                />
                <input
                  value={branchForm.code}
                  onChange={(event) =>
                    setBranchForm({ ...branchForm, code: event.target.value })
                  }
                  placeholder="Code"
                  required
                />
                <input
                  value={branchForm.address}
                  onChange={(event) =>
                    setBranchForm({
                      ...branchForm,
                      address: event.target.value,
                    })
                  }
                  placeholder="Address"
                  required
                />
                <input
                  value={branchForm.manager}
                  onChange={(event) =>
                    setBranchForm({
                      ...branchForm,
                      manager: event.target.value,
                    })
                  }
                  placeholder="Manager"
                />
                <input
                  value={branchForm.contactEmail}
                  onChange={(event) =>
                    setBranchForm({
                      ...branchForm,
                      contactEmail: event.target.value,
                    })
                  }
                  placeholder="Contact email"
                />
                <input
                  value={branchForm.contactPhone}
                  onChange={(event) =>
                    setBranchForm({
                      ...branchForm,
                      contactPhone: event.target.value,
                    })
                  }
                  placeholder="Phone"
                />
                <button className="primary-button compact" type="submit">
                  <Plus /> Add branch
                </button>
              </form>
            ) : null}
            <div className="branch-grid">
              {branches.map((branch) => (
                <article className="branch-card" key={branch.id}>
                  <div className="card-topline branch-topline">
                    <div>
                      <strong>{branch.name}</strong>
                      <span>{branch.code}</span>
                    </div>
                    {session.role === "super_admin" ? (
                      <details className="card-action-menu">
                        <summary
                          aria-label={`Open actions for ${branch.name}`}
                        >
                          <MoreVertical />
                        </summary>
                        <div className="card-action-list">
                          <button
                            type="button"
                            onClick={() => startEditBranch(branch)}
                          >
                            <Pencil /> Edit branch
                          </button>
                          <button
                            type="button"
                            className="danger-menu-item"
                            onClick={() => deleteBranch(branch)}
                          >
                            <Trash2 /> Delete
                          </button>
                        </div>
                      </details>
                    ) : null}
                  </div>
                  <p>{branch.address}</p>
                  <div className="branch-metrics">
                    <span>{branch.employees || 0} employees</span>
                    <span>{branch.students || 0} students</span>
                  </div>
                  <small>
                    {branch.manager} - {branch.contactPhone}
                  </small>
                  {editingBranchId === branch.id ? (
                    <form className="card-edit-form" onSubmit={updateBranch}>
                      <input
                        value={branchEditForm.name}
                        onChange={(event) =>
                          setBranchEditForm({
                            ...branchEditForm,
                            name: event.target.value,
                          })
                        }
                        placeholder="Branch name"
                        required
                      />
                      <input
                        value={branchEditForm.code}
                        onChange={(event) =>
                          setBranchEditForm({
                            ...branchEditForm,
                            code: event.target.value,
                          })
                        }
                        placeholder="Code"
                        required
                      />
                      <input
                        className="wide-field"
                        value={branchEditForm.address}
                        onChange={(event) =>
                          setBranchEditForm({
                            ...branchEditForm,
                            address: event.target.value,
                          })
                        }
                        placeholder="Address"
                        required
                      />
                      <input
                        value={branchEditForm.manager}
                        onChange={(event) =>
                          setBranchEditForm({
                            ...branchEditForm,
                            manager: event.target.value,
                          })
                        }
                        placeholder="Manager"
                      />
                      <input
                        type="email"
                        value={branchEditForm.contactEmail}
                        onChange={(event) =>
                          setBranchEditForm({
                            ...branchEditForm,
                            contactEmail: event.target.value,
                          })
                        }
                        placeholder="Contact email"
                      />
                      <input
                        value={branchEditForm.contactPhone}
                        onChange={(event) =>
                          setBranchEditForm({
                            ...branchEditForm,
                            contactPhone: event.target.value,
                          })
                        }
                        placeholder="Phone"
                      />
                      <div className="card-edit-actions">
                        <button className="primary-button compact" type="submit">
                          <Save /> Save
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => {
                            setEditingBranchId("");
                            setBranchEditForm(emptyBranchForm);
                          }}
                        >
                          <X /> Cancel
                        </button>
                      </div>
                    </form>
                  ) : null}
                </article>
              ))}
              {!branches.length ? (
                <article className="branch-card">
                  <div>
                    <strong>
                      {session.role === "branch_admin"
                        ? "No branch assigned"
                        : "No branches created"}
                    </strong>
                    <span>
                      {session.role === "branch_admin"
                        ? "Branch Admin"
                        : "Admin"}
                    </span>
                  </div>
                  <p>
                    {session.role === "branch_admin"
                      ? "This account is not linked to an active branch in MongoDB yet. A fresh seeded MongoDB will link the default Branch Admin to Main Branch."
                      : "Create a branch to begin assigning users."}
                  </p>
                  <div className="branch-metrics">
                    <span>0 employees</span>
                    <span>0 students</span>
                  </div>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {view === "emp-details" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h1>Emp details</h1>
                <p>
                  Review employee joining and bank account details for payroll
                  records.
                </p>
              </div>
            </div>
            <div className="table-list emp-details-table">
              {empDetailsRows.map(({ user }) => (
                <article className="table-row" key={user.id}>
                  {editingEmpDetailsId === user.id ? (
                    <form
                      className="emp-details-edit-form"
                      onSubmit={updateEmpDetails}
                    >
                      <strong>{displayName(user.name)}</strong>
                      <label className="field-label">
                        <span>Date of joining</span>
                        <input
                          type="date"
                          value={empDetailsForm.dateOfJoining}
                          onChange={(event) =>
                            setEmpDetailsForm({
                              ...empDetailsForm,
                              dateOfJoining: event.target.value,
                            })
                          }
                        />
                      </label>
                      <input
                        value={empDetailsForm.bankName}
                        onChange={(event) =>
                          setEmpDetailsForm({
                            ...empDetailsForm,
                            bankName: event.target.value,
                          })
                        }
                        placeholder="Bank name"
                      />
                      <input
                        value={empDetailsForm.bankAccountNumber}
                        onChange={(event) =>
                          setEmpDetailsForm({
                            ...empDetailsForm,
                            bankAccountNumber: event.target.value,
                          })
                        }
                        placeholder="Bank account number"
                      />
                      <input
                        value={empDetailsForm.panNumber}
                        onChange={(event) =>
                          setEmpDetailsForm({
                            ...empDetailsForm,
                            panNumber: event.target.value.toUpperCase(),
                          })
                        }
                        placeholder="PAN number"
                      />
                      <div className="row-actions emp-details-actions">
                        <button className="primary-button compact" type="submit">
                          <Save /> Save
                        </button>
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => {
                            setEditingEmpDetailsId("");
                            setEmpDetailsForm(emptyEmpDetailsForm);
                          }}
                        >
                          <X /> Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <strong>{displayName(user.name)}</strong>
                      <span>
                        {user.dateOfJoining
                          ? formatDate(user.dateOfJoining)
                          : "DOJ not set"}
                      </span>
                      <span>{user.bankName || "Bank not set"}</span>
                      <span>
                        {user.bankAccountNumber || "Account number not set"}
                      </span>
                      <span>{user.panNumber || "PAN not set"}</span>
                      <button
                        className="ghost-button compact-row-button"
                        type="button"
                        onClick={() => startEditEmpDetails(user)}
                      >
                        <Pencil /> Edit
                      </button>
                    </>
                  )}
                </article>
              ))}
              {!empDetailsRows.length ? (
                <article className="table-row">
                  <strong>No employee details</strong>
                  <span>Employee profiles will appear here after assignment.</span>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {view === "attendance" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h1>Face attendance</h1>
                <p>
                  Employees and students clock in and out with camera
                  verification, duplicate prevention, GPS capture, and location
                  match validation.
                </p>
              </div>
            </div>
            {session.role === "super_admin" ? (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Daily branch attendance</h2>
                    <p>
                      Monitor who is present or absent in every branch for the
                      selected day.
                    </p>
                  </div>
                  <div className="report-actions">
                    <select
                      value={attendanceMonitorBranchId}
                      onChange={(event) =>
                        setAttendanceMonitorBranchId(event.target.value)
                      }
                    >
                      <option value="">All branches</option>
                      {branches.map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={attendanceMonitorRole}
                      onChange={(event) =>
                        setAttendanceMonitorRole(
                          event.target.value as
                            "all" | "branch_admin" | "employee" | "student",
                        )
                      }
                    >
                      <option value="all">All users</option>
                      <option value="branch_admin">Branch Admin</option>
                      <option value="employee">Employee</option>
                      <option value="student">Student</option>
                    </select>
                    <input
                      type="date"
                      value={attendanceMonitorDate}
                      onChange={(event) =>
                        setAttendanceMonitorDate(event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="stats-grid attendance-stats-grid">
                  <Stat
                    label="Total Users"
                    value={dailyAttendanceMonitor.total}
                    icon={<Users />}
                  />
                  <Stat
                    label="Present"
                    value={dailyAttendanceMonitor.presentUsers.length}
                    icon={<UserCheck />}
                  />
                  <Stat
                    label="Absent"
                    value={dailyAttendanceMonitor.absentUsers.length}
                    icon={<UserX />}
                  />
                  <Stat
                    label="Attendance %"
                    value={dailyAttendanceMonitor.attendancePercentage}
                    icon={<Percent />}
                  />
                </div>
                <div className="attendance-summary-grid">
                  <section className="attendance-summary-card">
                    <div className="task-card-head">
                      <div>
                        <strong>Employee Attendance Summary</strong>
                        <span>{attendanceSummaries.branchName}</span>
                      </div>
                    </div>
                    <div className="stats-grid compact-stats">
                      <Stat
                        label="Total Employees"
                        value={attendanceSummaries.employees.total}
                        icon={<Users />}
                      />
                      <Stat
                        label="Present Employees"
                        value={attendanceSummaries.employees.present}
                        icon={<UserCheck />}
                      />
                      <Stat
                        label="Absent Employees"
                        value={attendanceSummaries.employees.absent}
                        icon={<UserX />}
                      />
                    </div>
                  </section>
                  <section className="attendance-summary-card">
                    <div className="task-card-head">
                      <div>
                        <strong>Student Attendance Summary</strong>
                        <span>{attendanceSummaries.branchName}</span>
                      </div>
                    </div>
                    <div className="stats-grid compact-stats">
                      <Stat
                        label="Total Students"
                        value={attendanceSummaries.students.total}
                        icon={<GraduationCap />}
                      />
                      <Stat
                        label="Present Students"
                        value={attendanceSummaries.students.present}
                        icon={<UserCheck />}
                      />
                      <Stat
                        label="Absent Students"
                        value={attendanceSummaries.students.absent}
                        icon={<UserX />}
                      />
                    </div>
                  </section>
                </div>
                <div className="attendance-list-stack">
                  <AttendancePeopleCard
                    title={`Present - ${dailyAttendanceMonitor.branchName}`}
                    people={dailyAttendanceMonitor.presentUsers}
                    branches={branches}
                    emptyText="No present users for this date."
                  />
                  <AttendancePeopleCard
                    title={`Absent - ${dailyAttendanceMonitor.branchName}`}
                    people={dailyAttendanceMonitor.absentUsers}
                    branches={branches}
                    emptyText="No absent users for this date."
                  />
                </div>
              </section>
            ) : null}
            {canClockAttendance(session) ? (
              <div className="attendance-console">
                <video ref={videoRef} autoPlay muted playsInline />
                <div className="hero-actions">
                  {!cameraOn ? (
                    <button
                      className="primary-button compact"
                      onClick={startCamera}
                    >
                      <Camera /> Start camera
                    </button>
                  ) : (
                    <button className="ghost-button" onClick={stopCamera}>
                      Stop camera
                    </button>
                  )}
                  <button
                    className="ghost-button"
                    disabled={
                      !cameraOn || verificationBusy || faceSamples.length >= 10
                    }
                    onClick={captureFaceRegistrationSample}
                  >
                    Capture face sample
                  </button>
                  <button
                    className="ghost-button"
                    disabled={verificationBusy || faceSamples.length < 3}
                    onClick={saveFaceRegistration}
                  >
                    Register face
                  </button>
                  <button
                    className="primary-button compact"
                    disabled={!cameraOn || verificationBusy}
                    onClick={() => markAttendance("clock-in")}
                  >
                    Clock in
                  </button>
                  <button
                    className="ghost-button"
                    disabled={!cameraOn || verificationBusy}
                    onClick={() => markAttendance("clock-out")}
                  >
                    Clock out
                  </button>
                </div>
                <div className="branch-metrics">
                  <span>{faceSamples.length}/10 face samples captured</span>
                  <span>
                    {livenessPrompt ||
                      "Liveness challenge appears during attendance"}
                  </span>
                  {verificationBusy ? (
                    <span>Verification running...</span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}

        {view === "leaves" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h1>Leave management</h1>
                <p>Apply for leave and track approval status.</p>
              </div>
            </div>
            {canApplyLeave(session) ? (
              <form className="inline-form" onSubmit={applyLeave}>
                <select
                  value={leaveForm.leaveType}
                  onChange={(event) =>
                    setLeaveForm({
                      ...leaveForm,
                      leaveType: event.target.value as Leave["leaveType"],
                    })
                  }
                >
                  <option value="casual">Casual leave</option>
                  <option value="sick">Sick leave</option>
                  <option value="permission">Permission</option>
                </select>
                <input
                  type="date"
                  value={leaveForm.fromDate}
                  onChange={(event) =>
                    setLeaveForm({ ...leaveForm, fromDate: event.target.value })
                  }
                  required
                />
                <input
                  type="date"
                  value={leaveForm.toDate}
                  onChange={(event) =>
                    setLeaveForm({ ...leaveForm, toDate: event.target.value })
                  }
                  required
                />
                <input
                  value={leaveForm.reason}
                  onChange={(event) =>
                    setLeaveForm({ ...leaveForm, reason: event.target.value })
                  }
                  placeholder="Reason"
                  required
                />
                <button className="primary-button compact" type="submit">
                  Apply
                </button>
              </form>
            ) : null}
            <div className="leave-record-head">
              <div>
                <h2>{canManage(session) ? "Approval requests" : "My leave requests"}</h2>
                <span>
                  {visibleLeaves.length} request
                  {visibleLeaves.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
            <div className="leave-approval-grid">
              {visibleLeaves.map((leave) => {
                const details = leaveDecisionDetails[leave.id];
                return (
                  <article className="leave-approval-card" key={leave.id}>
                    <div className="leave-card-head">
                      <strong>
                        {leave.employeeName ||
                          details?.user?.name ||
                          session.name}
                      </strong>
                      <span className={`pill ${leave.status}`}>
                        {leave.status}
                      </span>
                    </div>
                    <div className="leave-detail-grid">
                      <span>
                        <b>Leave</b>
                        {leave.leaveType}
                      </span>
                      <span>
                        <b>From</b>
                        {leave.fromDate}
                      </span>
                      <span>
                        <b>To</b>
                        {leave.toDate}
                      </span>
                      <span>
                        <b>Role</b>
                        {details?.user?.roleLabel ||
                          details?.user?.role ||
                          "Unknown"}
                      </span>
                      <span>
                        <b>Branch</b>
                        {details?.branch?.name || "No branch"}
                      </span>
                      <span>
                        <b>Last Month</b>
                        {details?.attendancePercentage ?? 0}% (
                        {details?.presentDays || 0}/{details?.totalDays || 0})
                      </span>
                      <span className="leave-reason">
                        <b>Reason</b>
                        {leave.reason}
                      </span>
                    </div>
                    {canManage(session) && leave.status === "pending" ? (
                      <div className="row-actions">
                        <button
                          className="primary-button leave-action-button"
                          onClick={() => decideLeave(leave, "approved")}
                        >
                          Approve
                        </button>
                        <button
                          className="danger-button"
                          onClick={() => decideLeave(leave, "rejected")}
                        >
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </article>
                );
              })}
              {!visibleLeaves.length ? (
                <article className="leave-empty">
                  <strong>
                    {canManage(session)
                      ? "No leave requests to approve"
                      : "No leave requests submitted"}
                  </strong>
                  <span>
                    {canManage(session)
                      ? "New employee and student leave requests will appear here."
                      : "Submit a leave request to track its approval status here."}
                  </span>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {view === "tasks" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h1>Task management</h1>
                <p>
                  Assign daily work, track deadlines, update progress, and keep
                  remarks in one place.
                </p>
              </div>
            </div>
            {canManage(session) ? (
              <>
                <form className="task-builder-card" onSubmit={createTeam}>
                  <input
                    value={teamForm.name}
                    onChange={(event) =>
                      setTeamForm({ ...teamForm, name: event.target.value })
                    }
                    placeholder="Team/group name"
                    required
                  />
                  <select
                    value={teamForm.branchId}
                    onChange={(event) =>
                      setTeamForm({ ...teamForm, branchId: event.target.value })
                    }
                    required
                  >
                    <option value="">Team branch</option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={teamForm.type}
                    onChange={(event) =>
                      setTeamForm({ ...teamForm, type: event.target.value })
                    }
                  >
                    <option value="employee">Employee team</option>
                    <option value="student">Student team</option>
                    <option value="mixed">Mixed group</option>
                  </select>
                  <details className="member-dropdown">
                    <summary>
                      {teamForm.memberIds.length
                        ? `${teamForm.memberIds.length} members selected`
                        : "Select members"}
                    </summary>
                    <div className="member-picker">
                      {assignableUsers
                        .filter((user) =>
                          teamForm.type === "mixed"
                            ? isTaskEmployeeUser(user) ||
                              effectiveRole(user.role) === "student"
                            : teamForm.type === "student"
                              ? effectiveRole(user.role) === "student"
                              : isTaskEmployeeUser(user),
                        )
                        .sort(compareTaskUsers)
                        .map((user) => {
                          const selected = teamForm.memberIds.includes(user.id);
                          return (
                            <label
                              className={`member-chip ${selected ? "selected" : ""}`}
                              key={user.id}
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={(event) =>
                                  setTeamForm({
                                    ...teamForm,
                                    memberIds: event.target.checked
                                      ? [...teamForm.memberIds, user.id]
                                      : teamForm.memberIds.filter(
                                          (id) => id !== user.id,
                                        ),
                                  })
                                }
                              />
                              <strong>{taskUserLabel(user, users)}</strong>
                              <span>{taskUserDetail(user, branches)}</span>
                            </label>
                          );
                        })}
                    </div>
                  </details>
                  <button className="primary-button compact" type="submit">
                    <Users /> Create team
                  </button>
                </form>
                <form className="inline-form task-form" onSubmit={assignTask}>
                  <input
                    value={taskForm.title}
                    onChange={(event) =>
                      setTaskForm({ ...taskForm, title: event.target.value })
                    }
                    placeholder="Task title"
                    required
                  />
                  <input
                    value={taskForm.description}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        description: event.target.value,
                      })
                    }
                    placeholder="Description or remarks"
                  />
                  <select
                    value={taskForm.teamId}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        teamId: event.target.value,
                        assignedUserId: "",
                      })
                    }
                  >
                    <option value="">Assign by individual</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={taskForm.assignedUserId}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        assignedUserId: event.target.value,
                        teamId: "",
                      })
                    }
                    required={!taskForm.teamId}
                  >
                    <option value="">Assign person</option>
                    {assignableUsers
                      .filter(isTaskEmployeeUser)
                      .sort(compareTaskUsers)
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {taskUserLabel(user, users)} -{" "}
                          {displayName(user.name)}
                        </option>
                      ))}
                  </select>
                  <select
                    value={taskForm.priority}
                    onChange={(event) =>
                      setTaskForm({
                        ...taskForm,
                        priority: event.target.value as TaskPriority,
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                  <input
                    type="date"
                    value={taskForm.deadline}
                    onChange={(event) =>
                      setTaskForm({ ...taskForm, deadline: event.target.value })
                    }
                    required
                  />
                  <button className="primary-button compact" type="submit">
                    <Plus /> Assign
                  </button>
                </form>
              </>
            ) : null}
            <div className="task-grid">
              {tasks.map((task) => {
                const draft = taskDrafts[task.assignmentId] || {
                  status: task.status,
                  progress: task.progress,
                  remarks: task.remarks || "",
                };
                return (
                  <article className="task-card" key={task.assignmentId}>
                    <div className="task-card-head">
                      <div>
                        <strong>{task.title}</strong>
                        <span>
                          {task.employeeName}
                          {task.teamName ? ` via ${task.teamName}` : ""} - due{" "}
                          {task.deadline}
                        </span>
                      </div>
                      <span className={`pill ${task.priority}`}>
                        <Flag />
                        {task.priority}
                      </span>
                    </div>
                    <p>{task.description || "No description added."}</p>
                    <div className="task-progress">
                      <span style={{ width: `${draft.progress}%` }} />
                    </div>
                    <div className="task-controls">
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setTaskDrafts({
                            ...taskDrafts,
                            [task.assignmentId]: {
                              ...draft,
                              status: event.target.value as TaskStatus,
                              progress:
                                event.target.value === "completed"
                                  ? 100
                                  : draft.progress,
                            },
                          })
                        }
                      >
                        {TASK_STATUS_OPTIONS.map((status) => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={draft.progress}
                        onChange={(event) =>
                          setTaskDrafts({
                            ...taskDrafts,
                            [task.assignmentId]: {
                              ...draft,
                              progress: Number(event.target.value),
                            },
                          })
                        }
                      />
                      <input
                        value={draft.remarks}
                        onChange={(event) =>
                          setTaskDrafts({
                            ...taskDrafts,
                            [task.assignmentId]: {
                              ...draft,
                              remarks: event.target.value,
                            },
                          })
                        }
                        placeholder="Progress remarks"
                      />
                      <button
                        className="primary-button compact"
                        onClick={() => updateTask(task)}
                      >
                        Update
                      </button>
                    </div>
                    <span className={`pill ${draft.status}`}>
                      {
                        TASK_STATUS_OPTIONS.find(
                          (item) => item.value === draft.status,
                        )?.label
                      }
                    </span>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {view === "calendar" ? (
          <section className="panel calendar-panel">
            <div className="section-heading calendar-title">
              <div>
                <span className="eyebrow">
                  <CalendarDays /> Official calendar
                </span>
                <h1>Calendar management</h1>
                <p>
                  Manage holidays, branch schedules, employee events, meeting
                  reminders, and upcoming notifications.
                </p>
              </div>
            </div>
            <section className="national-holidays-section calendar-section-card">
              <div className="task-card-head calendar-section-head">
                <div>
                  <h2>Holiday register</h2>
                  <span>
                    {stats.holidays} holidays for {new Date().getFullYear()}{" "}
                    sorted by date
                  </span>
                </div>
                <span className="pill government_holiday">
                  <CalendarCheck /> Government Holiday
                </span>
              </div>
              {session.role === "super_admin" ? (
                <form
                  className="inline-form holiday-form"
                  onSubmit={saveHoliday}
                >
                  <input
                    value={holidayForm.name}
                    onChange={(event) =>
                      setHolidayForm({
                        ...holidayForm,
                        name: event.target.value,
                      })
                    }
                    placeholder="Holiday name"
                    required
                  />
                  <input
                    type="date"
                    value={holidayForm.date}
                    onChange={(event) =>
                      setHolidayForm({
                        ...holidayForm,
                        date: event.target.value,
                      })
                    }
                    required
                  />
                  <select
                    value={holidayForm.type}
                    onChange={(event) =>
                      setHolidayForm({
                        ...holidayForm,
                        type: event.target.value as CompanyHoliday["type"],
                      })
                    }
                  >
                    {HOLIDAY_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <button className="primary-button compact" type="submit">
                    <Plus /> {editingHolidayId ? "Update" : "Add holiday"}
                  </button>
                  {editingHolidayId ? (
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => {
                        setHolidayForm(emptyHolidayForm);
                        setEditingHolidayId("");
                      }}
                    >
                      Cancel
                    </button>
                  ) : null}
                </form>
              ) : null}
              <div className="calendar-grid holiday-grid official-calendar-grid">
                {sortedCompanyHolidays.map((holiday) => (
                  <article
                    className={`calendar-card holiday-card ${holiday.type === "National Holiday" ? "national" : "government"}`}
                    key={holiday.id}
                  >
                    <div className="task-card-head">
                      <div>
                        <strong>{holiday.name}</strong>
                        <span>{holiday.date}</span>
                      </div>
                      <span
                        className={`pill ${holiday.type === "National Holiday" ? "national_holiday" : "government_holiday"}`}
                      >
                        {holiday.type}
                      </span>
                    </div>
                    <div className="branch-metrics">
                      <span>India</span>
                      <span>
                        {holiday.source === "default"
                          ? "Seeded default"
                          : "Additional holiday"}
                      </span>
                    </div>
                    {session.role === "super_admin" &&
                    holiday.source === "custom" ? (
                      <div className="row-actions">
                        <button
                          className="ghost-button"
                          type="button"
                          onClick={() => editHoliday(holiday)}
                        >
                          Edit
                        </button>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => deleteHoliday(holiday)}
                        >
                          <Trash2 /> Delete
                        </button>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
            {canManage(session) ? (
              <form
                className="inline-form calendar-form calendar-section-card"
                onSubmit={addCalendarEvent}
              >
                <input
                  value={calendarForm.title}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      title: event.target.value,
                    })
                  }
                  placeholder="Title"
                  required
                />
                <select
                  value={calendarForm.type}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      type: event.target.value as CalendarEventType,
                    })
                  }
                >
                  {CALENDAR_TYPE_OPTIONS.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
                <select
                  value={calendarForm.branchId}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      branchId: event.target.value,
                    })
                  }
                >
                  <option value="">Branch scope</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <select
                  value={calendarForm.employeeId}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      employeeId: event.target.value,
                    })
                  }
                >
                  <option value="">Employee event</option>
                  {employeeUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <select
                  value={calendarForm.studentId}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      studentId: event.target.value,
                    })
                  }
                >
                  <option value="">Student event</option>
                  {studentUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={calendarForm.startDate}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      startDate: event.target.value,
                    })
                  }
                  required
                />
                <input
                  type="date"
                  value={calendarForm.endDate}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      endDate: event.target.value,
                    })
                  }
                />
                <input
                  type="time"
                  value={calendarForm.startTime}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      startTime: event.target.value,
                    })
                  }
                />
                <input
                  value={calendarForm.description}
                  onChange={(event) =>
                    setCalendarForm({
                      ...calendarForm,
                      description: event.target.value,
                    })
                  }
                  placeholder="Notification note"
                />
                <button className="primary-button compact" type="submit">
                  <Plus /> Add
                </button>
              </form>
            ) : null}
            {calendarNotifications.length ? (
              <div className="notification-strip calendar-notification-strip">
                <Bell />
                <div>
                  <strong>Upcoming notifications</strong>
                  <span>
                    {calendarNotifications
                      .map((event) => `${event.title} on ${event.startDate}`)
                      .join(" | ")}
                  </span>
                </div>
              </div>
            ) : null}
            <div className="calendar-record-header">
              <div>
                <h2>Scheduled records</h2>
                <span>{calendarEvents.length} active calendar entries</span>
              </div>
            </div>
            <div className="calendar-grid official-calendar-grid">
              {calendarEvents.map((event) => (
                <article className="calendar-card" key={event.id}>
                  <div className="task-card-head">
                    <div>
                      <strong>{event.title}</strong>
                      <span>
                        {event.startDate}
                        {event.endDate && event.endDate !== event.startDate
                          ? ` to ${event.endDate}`
                          : ""}
                        {event.startTime ? ` at ${event.startTime}` : ""}
                      </span>
                    </div>
                    <span className={`pill ${event.type}`}>
                      {CALENDAR_TYPE_OPTIONS.find(
                        (item) => item.value === event.type,
                      )?.label || "Birthday"}
                    </span>
                  </div>
                  <p>{event.description || "No note added."}</p>
                  <div className="branch-metrics">
                    <span>{event.scope}</span>
                    {event.branchName ? <span>{event.branchName}</span> : null}
                    {event.employeeName ? (
                      <span>{event.employeeName}</span>
                    ) : null}
                    {event.studentName ? (
                      <span>{event.studentName}</span>
                    ) : null}
                  </div>
                  {canManage(session) ? (
                    <button
                      className="danger-button"
                      onClick={() => deleteCalendarEvent(event)}
                    >
                      <Trash2 /> Delete
                    </button>
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {view === "payroll" ? (
          <section className="panel payroll-panel">
            <div className="section-heading payroll-title">
              <div>
                <span className="eyebrow">
                  <WalletCards /> Salary register
                </span>
                <h1>Payroll and payslips</h1>
                <p>
                  Process monthly salary, deductions, net pay, and downloadable
                  payslips.
                </p>
              </div>
              <div className="report-actions payroll-actions">
                <select
                  value={payrollBranchId}
                  onChange={(event) => setPayrollBranchId(event.target.value)}
                >
                  <option value="">Select branch</option>
                  {payrollBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={reportMonth}
                  onChange={async (event) => {
                    setReportMonth(event.target.value);
                    await loadMonthlyReport(event.target.value);
                  }}
                />
                {canManage(session) ? (
                  <button
                    className="primary-button compact"
                    onClick={processPayroll}
                  >
                    <WalletCards /> Process payroll
                  </button>
                ) : null}
              </div>
            </div>
            <div className="payroll-card-grid">
              {visiblePayroll.map((row) => (
                <article className="payroll-card" key={row.id}>
                  <div className="payroll-card-head">
                    <div>
                      <strong>{row.employeeName || "Unknown employee"}</strong>
                      <span>
                        {row.employeeId || row.userId} - {row.month}
                      </span>
                    </div>
                    <span className="pill company_holiday">Processed</span>
                  </div>
                  <div className="payroll-amount-grid">
                    <span>
                      <b>Gross salary</b>
                      {formatCurrency(row.salary)}
                    </span>
                    <span>
                      <b>Deductions</b>
                      {formatCurrency(row.deductions)}
                    </span>
                    <span className="payroll-net">
                      <b>Net pay</b>
                      {formatCurrency(row.netPay)}
                    </span>
                  </div>
                  <button
                    className="ghost-button payroll-download-button"
                    onClick={() => downloadPayslip(row)}
                  >
                    <Download /> Download payslip
                  </button>
                </article>
              ))}
              {!visiblePayroll.length ? (
                <article className="payroll-empty">
                  <strong>No payroll generated</strong>
                  <span>
                    Select a branch and process the selected month to generate
                    salary slips and payslip PDFs.
                  </span>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {view === "regularization" ? (
          <section className="panel regularization-panel">
            <div className="section-heading regularization-title">
              <div>
                <span className="eyebrow">
                  <MapPin /> Attendance control
                </span>
                <h1>Attendance regularization</h1>
                <p>
                  Submit missed punch, timing correction, and late-entry
                  requests with a clear approval trail.
                </p>
              </div>
            </div>
            {canUseEmployeeTools(session) ? (
              <form
                className="regularization-form"
                onSubmit={submitRegularization}
              >
                <div className="regularization-form-head">
                  <div>
                    <strong>New correction request</strong>
                    <span>
                      Use this only for attendance exceptions that need
                      approval.
                    </span>
                  </div>
                  <span className="pill pending">Approval required</span>
                </div>
                <div className="regularization-fields">
                  <label>
                    <span>Request type</span>
                    <select
                      value={regularizationForm.type}
                      onChange={(event) =>
                        setRegularizationForm({
                          ...regularizationForm,
                          type: event.target
                            .value as RegularizationRequest["type"],
                        })
                      }
                    >
                      <option value="missing_clock_in">Missing Clock In</option>
                      <option value="missing_clock_out">
                        Missing Clock Out
                      </option>
                      <option value="attendance_correction">
                        Attendance Correction
                      </option>
                      <option value="late_entry">Late Entry Request</option>
                    </select>
                  </label>
                  <label>
                    <span>Attendance date</span>
                    <input
                      type="date"
                      value={regularizationForm.date}
                      onChange={(event) =>
                        setRegularizationForm({
                          ...regularizationForm,
                          date: event.target.value,
                        })
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>Requested clock in</span>
                    <input
                      type="time"
                      value={regularizationForm.requestedClockIn}
                      onChange={(event) =>
                        setRegularizationForm({
                          ...regularizationForm,
                          requestedClockIn: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Requested clock out</span>
                    <input
                      type="time"
                      value={regularizationForm.requestedClockOut}
                      onChange={(event) =>
                        setRegularizationForm({
                          ...regularizationForm,
                          requestedClockOut: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="regularization-reason-field">
                    <span>Reason</span>
                    <input
                      value={regularizationForm.reason}
                      onChange={(event) =>
                        setRegularizationForm({
                          ...regularizationForm,
                          reason: event.target.value,
                        })
                      }
                      placeholder="Brief approval note"
                      required
                    />
                  </label>
                  <button className="primary-button compact" type="submit">
                    <Plus /> Submit request
                  </button>
                </div>
              </form>
            ) : null}
            <div className="regularization-record-head">
              <div>
                <h2>Correction requests</h2>
                <span>
                  {regularization.length} request
                  {regularization.length === 1 ? "" : "s"} in approval workflow
                </span>
              </div>
            </div>
            <div className="regularization-grid">
              {regularization.map((request) => (
                <article className="regularization-card" key={request.id}>
                  <div className="regularization-card-head">
                    <div>
                      <strong>{request.userName || session.name}</strong>
                      <span>
                        {REGULARIZATION_TYPE_LABELS[request.type]} -{" "}
                        {request.date}
                      </span>
                    </div>
                    <span className={`pill ${request.status}`}>
                      {request.status.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="regularization-detail-grid">
                    <span>
                      <b>Clock in</b>
                      {request.requestedClockIn || "-"}
                    </span>
                    <span>
                      <b>Clock out</b>
                      {request.requestedClockOut || "-"}
                    </span>
                    <span className="regularization-reason">
                      <b>Reason</b>
                      {request.reason}
                    </span>
                  </div>
                  {canManage(session) &&
                  !["approved", "rejected"].includes(request.status) ? (
                    <div className="row-actions regularization-actions">
                      <button
                        className="primary-button leave-action-button"
                        onClick={() =>
                          decideRegularization(request, "approved")
                        }
                      >
                        Approve
                      </button>
                      <button
                        className="danger-button"
                        onClick={() =>
                          decideRegularization(request, "rejected")
                        }
                      >
                        Reject
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
              {!regularization.length ? (
                <article className="regularization-empty">
                  <strong>No correction requests</strong>
                  <span>
                    Submitted requests will appear here for review and approval.
                  </span>
                </article>
              ) : null}
            </div>
          </section>
        ) : null}

        {view === "reports" ? (
          <section className="panel">
            <div className="section-heading">
              <div>
                <h1>Monthly reports</h1>
                <p>
                  Review attendance, task completion, and employee performance
                  summaries for management.
                </p>
              </div>
              <div className="report-actions">
                <select
                  value={reportType}
                  onChange={(event) =>
                    setReportType(event.target.value as ReportType)
                  }
                >
                  {REPORT_TYPE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  type="month"
                  value={reportMonth}
                  onChange={async (event) => {
                    setReportMonth(event.target.value);
                    await loadMonthlyReport(event.target.value);
                  }}
                />
                <button
                  className="ghost-button"
                  onClick={() => exportMonthlyReport("pdf")}
                >
                  <Download /> PDF
                </button>
                <button
                  className="ghost-button"
                  onClick={() => exportMonthlyReport("excel")}
                >
                  <FileSpreadsheet /> Excel
                </button>
              </div>
            </div>
            {monthlyReport ? (
              <>
                <div className="stats-grid">
                  <Stat
                    label="Employees"
                    value={monthlyReport.totals.employees}
                    icon={<Users />}
                  />
                  <Stat
                    label="Students"
                    value={monthlyReport.totals.students}
                    icon={<Users />}
                  />
                  <Stat
                    label="Attendance"
                    value={monthlyReport.totals.attendanceRecords}
                    icon={<CalendarCheck />}
                  />
                  <Stat
                    label="Completed"
                    value={monthlyReport.totals.completedTasks}
                    icon={<Check />}
                  />
                  <Stat
                    label="Payroll"
                    value={monthlyReport.totals.payrollProcessed}
                    icon={<WalletCards />}
                  />
                </div>
                <div className="table-list report-table">
                  {monthlyReport.rows.map((row) => (
                    <article className="table-row" key={row.employeeId}>
                      <strong>{row.employeeName}</strong>
                      <span>
                        {row.role} - {row.attendanceDays} days
                      </span>
                      <span>{row.attendancePercentage}% attendance</span>
                      <span>
                        {row.completedTasks}/{row.totalTasks} tasks
                      </span>
                      <span>{row.completionRate}% completion</span>
                      <span>
                        {row.netPay
                          ? `Net pay ${row.netPay}`
                          : `${row.leaveRequests} leaves`}
                      </span>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {view === "security" ? (
          <section className="panel narrow-panel">
            <div className="section-heading">
              <div>
                <h1>Security</h1>
                <p>
                  Password hashing, JWT sessions, and logout revocation are
                  handled by the API.
                </p>
              </div>
            </div>
            <div className="security-intro">
              <ShieldCheck />
              <div>
                <strong>Session secured</strong>
                <p>
                  Login uses the selected role, stored password hash, and JWT
                  session token.
                </p>
              </div>
            </div>
          </section>
        ) : null}
      </section>
      {notice ? (
        <div className={`toast ${error === notice ? "error" : ""}`}>
          {notice}
        </div>
      ) : null}
    </main>
  );
}

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <article className="stat-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function AttendancePeopleCard({
  title,
  people,
  branches,
  emptyText,
}: {
  title: string;
  people: AttendancePersonRow[];
  branches: Branch[];
  emptyText: string;
}) {
  return (
    <details className="attendance-accordion">
      <summary>
        <strong>{title}</strong>
        <span className="pill present">{people.length}</span>
      </summary>
      <div className="attendance-list-table">
        {people.length ? (
          <div className="attendance-list-row attendance-list-head">
            <span>S.No</span>
            <span>Name</span>
            <span>ID / Email</span>
            <span>Role</span>
            <span>Branch</span>
            <span>In Time</span>
            <span>Out Time</span>
            <span>Profile</span>
          </div>
        ) : null}
        {people.map(({ user: person, record }, index) => {
          const branchName =
            branches.find((branch) => branch.id === person.branchId)?.name ||
            "No branch";
          return (
            <div className="attendance-list-row" key={`${title}-${person.id}`}>
              <span>{index + 1}</span>
              <strong>{person.name}</strong>
              <span>
                {person.employeeId || person.studentId || person.email}
              </span>
              <span>{person.roleLabel || person.role}</span>
              <span>{branchName}</span>
              <span>{formatAttendanceTime(record?.clockInAt)}</span>
              <span>{formatAttendanceTime(record?.clockOutAt)}</span>
              <span>{person.profile || "-"}</span>
            </div>
          );
        })}
        {!people.length ? (
          <div className="attendance-list-empty">
            <strong>{emptyText}</strong>
            <span>Change branch or date to review another day.</span>
          </div>
        ) : null}
      </div>
    </details>
  );
}

function AnalyticsPanel({
  analytics,
  stats,
}: {
  analytics: AnalyticsData;
  stats: DashboardStats;
}) {
  return (
    <section className="panel dashboard-summary-panel">
      <div className="section-heading dashboard-section-head">
        <div>
          <h2>Dashboard summary</h2>
          <p>Organization totals and current open work in one place.</p>
        </div>
      </div>
      <div className="stats-grid dashboard-summary-grid">
        <SummaryStat
          label="Branches"
          value={analytics.cards.totalBranches || 0}
          icon={<Building2 />}
          tone="blue"
        />
        <SummaryStat
          label="Users"
          value={stats.users || 1}
          icon={<Users />}
          tone="cyan"
        />
        <SummaryStat
          label="Employees"
          value={analytics.cards.totalEmployees || 0}
          icon={<Users />}
          tone="indigo"
        />
        <SummaryStat
          label="Students"
          value={analytics.cards.totalStudents || 0}
          icon={<Users />}
          tone="green"
        />
        <SummaryStat
          label="Attendance"
          value={analytics.cards.totalAttendance || 0}
          icon={<CalendarCheck />}
          tone="teal"
        />
        <SummaryStat
          label="Leaves"
          value={analytics.cards.totalLeaves || 0}
          icon={<CalendarDays />}
          tone="amber"
        />
        <SummaryStat
          label="Open tasks"
          value={stats.openTasks}
          icon={<ClipboardList />}
          tone="rose"
        />
      </div>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <article className={`stat-card summary-stat summary-stat-${tone}`}>
      <div className="summary-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PersonalStat({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <article className={`stat-card personal-stat summary-stat-${tone}`}>
      <div className="summary-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function HeroProfileCard({ user }: { user?: User | null }) {
  const role = effectiveRole(user?.role);
  const profileType =
    role === "student" ? "Student profile" : "Employee profile";
  return (
    <div className="hero-profile-card">
      <div
        className="hero-profile-photo"
        style={
          user?.picture
            ? { backgroundImage: `url(${user.picture})` }
            : undefined
        }
      >
        {!user?.picture ? initials(displayName(user?.name)) : null}
      </div>
      <div>
        <span>{profileType}</span>
        <strong>{displayName(user?.name)}</strong>
        <p>
          {user?.employeeId ||
            user?.studentId ||
            user?.email ||
            "Profile pending"}
        </p>
      </div>
    </div>
  );
}

function ReportsPanel({ reports }: { reports: BranchReport[] }) {
  return (
    <section className="panel dashboard-branch-panel">
      <div className="section-heading dashboard-section-head">
        <div>
          <h2>Branch-wise reports</h2>
          <p>Employee, student, attendee, and absentee totals by branch.</p>
        </div>
      </div>
      <div className="branch-grid dashboard-branch-grid">
        {reports.map((report) => {
          const absentees =
            report.absentees ??
            Math.max(
              0,
              report.employees + report.students - report.attendanceToday,
            );
          return (
            <article
              className="branch-card dashboard-branch-card"
              key={report.branchId}
            >
              <div className="branch-card-head">
                <strong>{report.branchName}</strong>
                <span>{report.attendanceToday} attendees today</span>
              </div>
              <div className="branch-count-grid">
                <div>
                  <b>{report.employees}</b>
                  <span>Employees</span>
                </div>
                <div>
                  <b>{report.students}</b>
                  <span>Students</span>
                </div>
                <div>
                  <b>{report.attendanceToday}</b>
                  <span>Attendees</span>
                </div>
                <div>
                  <b>{absentees}</b>
                  <span>Absentees</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

