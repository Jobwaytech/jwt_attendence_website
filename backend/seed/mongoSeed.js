import bcrypt from "bcryptjs";
import {
  Attendance,
  Branch,
  Calendar,
  Leave,
  Payroll,
  Report,
  Task,
  User,
} from "../models/index.js";

const passwordHashPromise = bcrypt.hash("123456", 10);
const TASK_EMPLOYEES = [
  { name: "Employee 1", email: "employee1@example.com", employeeId: "EMP-E1" },
  { name: "Employee 2", email: "employee2@example.com", employeeId: "EMP-E2" },
  { name: "Employee 3", email: "employee3@example.com", employeeId: "EMP-E3" },
  { name: "Employee 4", email: "employee4@example.com", employeeId: "EMP-E4" },
  { name: "Employee 5", email: "employee5@example.com", employeeId: "EMP-E5" },
];

async function ensureTaskEmployees(branchId, passwordHash) {
  if (!branchId) return [];
  return Promise.all(
    TASK_EMPLOYEES.map((employee, index) =>
      User.findOneAndUpdate(
        { email: employee.email },
        {
          ...employee,
          passwordHash,
          role: "employee",
          roleLabel: "Employee",
          branchId,
          phone: "",
          profile: `Task employee ${index + 1}`,
          salary: 30000,
          provider: "password",
          faceSignature: "not-enrolled",
        },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
      ),
    ),
  );
}

async function ensureDemoPayslip(passwordHash) {
  const branch = await Branch.findOneAndUpdate(
    { code: "BR-001" },
    {
      name: "Main Branch",
      code: "BR-001",
      address: "Branch Address 1",
      manager: "Admin",
      contactEmail: "branch1@example.com",
      contactPhone: "+91 90000 00001",
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  const superAdmin = await User.findOneAndUpdate(
    { email: "superadmin@example.com" },
    {
      name: "Admin",
      email: "superadmin@example.com",
      passwordHash,
      role: "super_admin",
      roleLabel: "Super Admin",
      phone: "+91 90000 00000",
      dob: new Date("1990-01-15"),
      profile: "Global system owner",
      provider: "password",
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );
  const employee = await User.findOneAndUpdate(
    { email: "employee@example.com" },
    {
      name: "Employee",
      email: "employee@example.com",
      passwordHash,
      role: "employee",
      roleLabel: "Employee",
      branchId: branch._id,
      phone: "+91 90000 00003",
      dob: new Date("1996-05-29"),
      profile: "Employee portal demo account",
      employeeId: "EMP-1003",
      salary: 30000,
      provider: "password",
      faceSignature: "not-enrolled",
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  await Payroll.findOneAndUpdate(
    { userId: employee._id, month: "2026-06" },
    {
      userId: employee._id,
      branchId: branch._id,
      month: "2026-06",
      workingDays: 26,
      presentDays: 24,
      absentDays: 1,
      leaveDays: 1,
      attendancePercentage: 92,
      salary: 30000,
      basicSalary: 30000,
      hra: 0,
      incentivePay: 0,
      bonus: 0,
      specialAllowance: 0,
      otherEarnings: 0,
      grossSalary: 30000,
      providentFund: 2000,
      esi: 0,
      professionalTax: 0,
      salaryAdvance: 0,
      loan: 0,
      otherDeductions: 0,
      totalDeductions: 2000,
      netPay: 28000,
      processedBy: superAdmin._id,
      processedAt: new Date(),
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  );

  return { branch, superAdmin, employee };
}

export async function seedMongoData() {
  const passwordHash = await passwordHashPromise;
  const existingSuperAdmin = await User.exists({
    email: "superadmin@example.com",
  });
  if (existingSuperAdmin) {
    const demo = await ensureDemoPayslip(passwordHash);
    await ensureTaskEmployees(demo.branch?._id, passwordHash);
    return;
  }

  const [mainBranch, eastBranch] = await Branch.create([
    {
      name: "Main Branch",
      code: "BR-001",
      address: "Branch Address 1",
      manager: "Admin",
      contactEmail: "branch1@example.com",
      contactPhone: "+91 90000 00001",
    },
    {
      name: "Branch 2",
      code: "BR-002",
      address: "Branch Address 2",
      manager: "Branch Admin",
      contactEmail: "branch2@example.com",
      contactPhone: "+91 90000 00002",
    },
  ]);

  const [superAdmin, branchAdmin, employee, student] = await User.create([
    {
      name: "Admin",
      email: "superadmin@example.com",
      passwordHash,
      role: "super_admin",
      roleLabel: "Super Admin",
      phone: "+91 90000 00000",
      dob: new Date("1990-01-15"),
      profile: "Global system owner",
      provider: "password",
    },
    {
      name: "Branch Admin",
      email: "branchadmin@example.com",
      passwordHash,
      role: "branch_admin",
      roleLabel: "Branch Admin",
      branchId: mainBranch._id,
      phone: "+91 90000 00002",
      dob: new Date("1992-03-12"),
      profile: "Branch admin demo account",
      employeeId: "EMP-1002",
      salary: 40000,
      provider: "password",
    },
    {
      name: "Employee",
      email: "employee@example.com",
      passwordHash,
      role: "employee",
      roleLabel: "Employee",
      branchId: mainBranch._id,
      phone: "+91 90000 00003",
      dob: new Date("1996-05-29"),
      profile: "Employee portal demo account",
      employeeId: "EMP-1003",
      salary: 30000,
      provider: "password",
      faceSignature: "not-enrolled",
    },
    {
      name: "Student",
      email: "student@example.com",
      passwordHash,
      role: "student",
      roleLabel: "Student",
      branchId: eastBranch._id,
      phone: "+91 90000 00004",
      dob: new Date("2003-05-29"),
      profile: "Student portal demo account",
      studentId: "STU-2001",
      provider: "password",
    },
  ]);
  await ensureTaskEmployees(mainBranch._id, passwordHash);

  await Attendance.create({
    userId: employee._id,
    branchId: mainBranch._id,
    date: new Date().toISOString().slice(0, 10),
    clockInAt: new Date(),
    status: "present",
    allowedRadiusMeters: 150,
    verification: "seeded",
  });

  await Leave.create({
    userId: employee._id,
    branchId: mainBranch._id,
    leaveType: "casual",
    fromDate: "2026-06-18",
    toDate: "2026-06-18",
    reason: "Seed leave request",
  });

  await Task.create({
    title: "Prepare monthly attendance report",
    description: "Seed task for MongoDB testing",
    branchId: mainBranch._id,
    priority: "medium",
    deadline: "2026-06-30",
    assignedBy: branchAdmin._id,
    assignments: [{ userId: employee._id, status: "pending", progress: 0 }],
  });

  await Payroll.create({
    userId: employee._id,
    branchId: mainBranch._id,
    month: "2026-06",
    salary: 30000,
    basicSalary: 30000,
    hra: 0,
    grossSalary: 30000,
    providentFund: 2000,
    totalDeductions: 2000,
    netPay: 28000,
    processedBy: superAdmin._id,
    processedAt: new Date(),
  });

  await Calendar.create([
    {
      title: "Independence Day",
      type: "national_holiday",
      scope: "company",
      startDate: "2026-08-15",
      endDate: "2026-08-15",
      description: "National Holiday",
      createdBy: superAdmin._id,
    },
    {
      title: "Branch training session",
      type: "training_schedule",
      scope: "branch",
      branchId: mainBranch._id,
      startDate: "2026-06-25",
      endDate: "2026-06-25",
      description: "Seed calendar event",
      createdBy: branchAdmin._id,
    },
  ]);

  await Report.create({
    reportType: "monthly",
    month: "2026-06",
    branchId: mainBranch._id,
    generatedBy: superAdmin._id,
    totals: { employees: 2, students: 1, payrollNetPay: 28000 },
    rows: [{ employeeName: employee.name, role: employee.role, netPay: 28000 }],
    notes: "Seed monthly report",
  });

  console.log("MongoDB seed data created.");
}
