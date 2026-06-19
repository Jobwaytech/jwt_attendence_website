export type PayrollEmployee = {
  id: string;
  employeeName: string;
  employeeId: string;
  employeeAddress: string;
  branchName: string;
  department: string;
  designation: string;
  dateOfJoining: string;
  phoneNumber: string;
  emailAddress: string;
};

export type AttendanceDetails = {
  workingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  attendancePercentage: number;
};

export type Earnings = {
  basicSalary: number;
  hra: number;
  incentivePay: number;
  bonus: number;
  specialAllowance: number;
  otherEarnings: number;
};

export type Deductions = {
  providentFund: number;
  esi: number;
  professionalTax: number;
  salaryAdvance: number;
  loan: number;
  otherDeductions: number;
};

export type PayrollRecord = {
  id: string;
  employeeId: string;
  month: string;
  employee: PayrollEmployee;
  attendance: AttendanceDetails;
  earnings: Earnings;
  deductions: Deductions;
  grossSalary: number;
  totalEarnings: number;
  totalDeductions: number;
  netSalary: number;
  ytdNetSalary: number;
  createdAt: string;
};

export type PayslipRecord = PayrollRecord & {
  payslipNumber: string;
  status: "generated" | "saved";
  savedAt?: string;
};

export type PayrollDraft = {
  employeeId: string;
  month: string;
  workingDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  basicSalary: number;
  incentivePay: number;
  bonus: number;
  specialAllowance: number;
  otherEarnings: number;
  professionalTax: number;
  salaryAdvance: number;
  loan: number;
  otherDeductions: number;
};
