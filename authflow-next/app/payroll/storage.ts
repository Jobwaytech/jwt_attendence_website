import type {
  PayrollDraft,
  PayrollEmployee,
  PayrollRecord,
  PayslipRecord,
} from "./types";
import { percentage, toPayslip } from "./utils";

type MongoUser = {
  _id: string;
  id?: string;
  name: string;
  email: string;
  role: string;
  branchId?: string | null;
  phone?: string;
  profile?: string;
  employeeId?: string;
  salary?: number;
  createdAt?: string;
};

type MongoBranch = {
  _id: string;
  name: string;
  address?: string;
};

type MongoPayroll = {
  _id: string;
  userId: string;
  branchId?: string | null;
  month: string;
  workingDays?: number;
  presentDays?: number;
  absentDays?: number;
  leaveDays?: number;
  attendancePercentage?: number;
  salary?: number;
  basicSalary?: number;
  hra?: number;
  incentivePay?: number;
  bonus?: number;
  bonuses?: number;
  specialAllowance?: number;
  otherEarnings?: number;
  grossSalary?: number;
  providentFund?: number;
  esi?: number;
  professionalTax?: number;
  salaryAdvance?: number;
  loan?: number;
  otherDeductions?: number;
  totalDeductions?: number;
  netPay?: number;
  createdAt?: string;
};

const employees: PayrollEmployee[] = [
  {
    id: "emp-arjun",
    employeeName: "Arjun Kumar",
    employeeId: "JWT-EMP-1001",
    employeeAddress: "Madhapur, Hyderabad, Telangana",
    branchName: "Hyderabad Main",
    department: "Engineering",
    designation: "Frontend Developer",
    dateOfJoining: "2024-07-15",
    phoneNumber: "+91 98765 43210",
    emailAddress: "arjun.kumar@jobwaytech.in",
  },
  {
    id: "emp-priya",
    employeeName: "Priya Menon",
    employeeId: "JWT-EMP-1002",
    employeeAddress: "Whitefield, Bengaluru, Karnataka",
    branchName: "Bengaluru East",
    department: "Training",
    designation: "Technical Mentor",
    dateOfJoining: "2023-11-06",
    phoneNumber: "+91 99887 76655",
    emailAddress: "priya.menon@jobwaytech.in",
  },
  {
    id: "emp-rahul",
    employeeName: "Rahul Verma",
    employeeId: "JWT-EMP-1003",
    employeeAddress: "T Nagar, Chennai, Tamil Nadu",
    branchName: "Chennai Training Center",
    department: "Operations",
    designation: "Branch Coordinator",
    dateOfJoining: "2025-01-20",
    phoneNumber: "+91 91234 56780",
    emailAddress: "rahul.verma@jobwaytech.in",
  },
];

const baseDrafts: Record<string, PayrollDraft> = {
  "emp-arjun": {
    employeeId: "emp-arjun",
    month: "2026-05",
    workingDays: 26,
    presentDays: 24,
    absentDays: 1,
    leaveDays: 1,
    basicSalary: 42000,
    incentivePay: 5000,
    bonus: 3500,
    specialAllowance: 4500,
    otherEarnings: 1200,
    professionalTax: 200,
    salaryAdvance: 0,
    loan: 1500,
    otherDeductions: 300,
  },
  "emp-priya": {
    employeeId: "emp-priya",
    month: "2026-05",
    workingDays: 26,
    presentDays: 25,
    absentDays: 0,
    leaveDays: 1,
    basicSalary: 56000,
    incentivePay: 8000,
    bonus: 7000,
    specialAllowance: 6500,
    otherEarnings: 1500,
    professionalTax: 200,
    salaryAdvance: 0,
    loan: 0,
    otherDeductions: 500,
  },
  "emp-rahul": {
    employeeId: "emp-rahul",
    month: "2026-05",
    workingDays: 26,
    presentDays: 23,
    absentDays: 2,
    leaveDays: 1,
    basicSalary: 31500,
    incentivePay: 3000,
    bonus: 2000,
    specialAllowance: 3500,
    otherEarnings: 900,
    professionalTax: 200,
    salaryAdvance: 2500,
    loan: 0,
    otherDeductions: 250,
  },
};

export function getPayrollEmployees() {
  return employees;
}

export function defaultPayrollDraft(
  employeeId = employees[0].id,
  month = new Date().toISOString().slice(0, 7),
): PayrollDraft {
  const draft = baseDrafts[employeeId] || baseDrafts[employees[0].id];
  return { ...draft, employeeId, month };
}

export function mongoUsersToPayrollEmployees(
  users: MongoUser[],
  branches: MongoBranch[],
): PayrollEmployee[] {
  const branchById = new Map(branches.map((branch) => [branch._id, branch]));
  const mapped = users
    .filter((user) => ["employee", "branch_admin"].includes(user.role))
    .map((user) => {
      const branch = user.branchId
        ? branchById.get(String(user.branchId))
        : null;
      return {
        id: user._id || user.id || user.employeeId || user.email,
        employeeName: user.name,
        employeeId: user.employeeId || user._id,
        employeeAddress: user.profile || branch?.address || "JobWayTech Office",
        branchName: branch?.name || "No branch",
        department: user.role === "branch_admin" ? "Operations" : "Employee",
        designation: user.role === "branch_admin" ? "Branch Admin" : "Employee",
        dateOfJoining: user.createdAt
          ? new Date(user.createdAt).toLocaleDateString("en-IN")
          : "-",
        phoneNumber: user.phone || "-",
        emailAddress: user.email,
      };
    });
  return mapped.length ? mapped : employees;
}

export function mongoPayrollToRecord(
  row: MongoPayroll,
  employee: PayrollEmployee,
  existingRecords: PayrollRecord[] = [],
): PayrollRecord {
  const workingDays = Number(row.workingDays || 0);
  const presentDays = Number(row.presentDays || 0);
  const grossSalary = Number(
    row.grossSalary ?? row.basicSalary ?? row.salary ?? 0,
  );
  const totalDeductions = Number(row.totalDeductions ?? 0);
  const netSalary = Number(row.netPay ?? grossSalary - totalDeductions);
  const createdAt = row.createdAt || new Date().toISOString();
  return {
    id: row._id,
    employeeId: employee.id,
    month: row.month,
    employee,
    attendance: {
      workingDays,
      presentDays,
      absentDays: Number(row.absentDays || 0),
      leaveDays: Number(row.leaveDays || 0),
      attendancePercentage: Number(
        row.attendancePercentage ?? percentage(presentDays, workingDays),
      ),
    },
    earnings: {
      basicSalary: Number(row.basicSalary ?? row.salary ?? 0),
      hra: Number(row.hra || 0),
      incentivePay: Number(row.incentivePay || 0),
      bonus: Number(row.bonus ?? row.bonuses ?? 0),
      specialAllowance: Number(row.specialAllowance || 0),
      otherEarnings: Number(row.otherEarnings || 0),
    },
    deductions: {
      providentFund: Number(row.providentFund || 0),
      esi: Number(row.esi || 0),
      professionalTax: Number(row.professionalTax || 0),
      salaryAdvance: Number(row.salaryAdvance || 0),
      loan: Number(row.loan || 0),
      otherDeductions: Number(row.otherDeductions || 0),
    },
    grossSalary,
    totalEarnings: grossSalary,
    totalDeductions,
    netSalary,
    ytdNetSalary: existingRecords
      .filter(
        (record) =>
          record.employeeId === employee.id &&
          record.month.slice(0, 4) === row.month.slice(0, 4),
      )
      .reduce((total, record) => total + record.netSalary, netSalary),
    createdAt,
  };
}

export function payrollRecordToMongo(record: PayrollRecord) {
  return {
    userId: record.employeeId,
    month: record.month,
    workingDays: record.attendance.workingDays,
    presentDays: record.attendance.presentDays,
    absentDays: record.attendance.absentDays,
    leaveDays: record.attendance.leaveDays,
    attendancePercentage: record.attendance.attendancePercentage,
    salary: record.earnings.basicSalary,
    basicSalary: record.earnings.basicSalary,
    hra: record.earnings.hra,
    incentivePay: record.earnings.incentivePay,
    bonus: record.earnings.bonus,
    specialAllowance: record.earnings.specialAllowance,
    otherEarnings: record.earnings.otherEarnings,
    grossSalary: record.grossSalary,
    providentFund: record.deductions.providentFund,
    esi: record.deductions.esi,
    professionalTax: record.deductions.professionalTax,
    salaryAdvance: record.deductions.salaryAdvance,
    loan: record.deductions.loan,
    otherDeductions: record.deductions.otherDeductions,
    totalDeductions: record.totalDeductions,
    netPay: record.netSalary,
  };
}

export function recordsToPayslips(records: PayrollRecord[]): PayslipRecord[] {
  return records.map((record) => ({
    ...toPayslip(record),
    status: "saved" as const,
    savedAt: record.createdAt,
  }));
}
