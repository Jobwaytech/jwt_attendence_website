import mongoose from "mongoose";

const moneyField = { type: Number, min: 0, default: 0 };

const payrollSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: "Branch", default: null, index: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    workingDays: { type: Number, min: 0, default: 0 },
    presentDays: { type: Number, min: 0, default: 0 },
    absentDays: { type: Number, min: 0, default: 0 },
    leaveDays: { type: Number, min: 0, default: 0 },
    attendancePercentage: { type: Number, min: 0, max: 100, default: 0 },
    salary: moneyField,
    basicSalary: moneyField,
    hra: moneyField,
    incentivePay: moneyField,
    bonus: moneyField,
    specialAllowance: moneyField,
    otherEarnings: moneyField,
    grossSalary: moneyField,
    providentFund: moneyField,
    esi: moneyField,
    professionalTax: moneyField,
    salaryAdvance: moneyField,
    loan: moneyField,
    otherDeductions: moneyField,
    totalDeductions: moneyField,
    netPay: moneyField,
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

payrollSchema.index({ userId: 1, month: 1 }, { unique: true });

export default mongoose.models.Payroll || mongoose.model("Payroll", payrollSchema);
