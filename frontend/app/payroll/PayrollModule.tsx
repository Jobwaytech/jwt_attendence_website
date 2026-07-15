"use client";

import {
  Download,
  Eye,
  FileSpreadsheet,
  Printer,
  Save,
  WalletCards,
} from "lucide-react";
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { mongoList, mongoCreate, mongoUpdate } from "../services/api";
import {
  defaultPayrollDraft,
  getPayrollEmployees,
  mongoPayrollToRecord,
  mongoUsersToPayrollEmployees,
  payrollRecordToMongo,
  recordsToPayslips,
} from "./storage";
import type { PayrollDraft, PayrollRecord, PayslipRecord } from "./types";
import {
  JOBWAYTECH_LOGO_ALT,
  JOBWAYTECH_LOGO_SRC,
  buildPayrollRecord,
  createPayslipPdfBlob,
  exportRowsCsv,
  formatCurrency,
  formatPayrollPeriodRange,
  toPayslip,
} from "./utils";

type PayrollModuleProps = {
  mode: "payroll" | "payslips";
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function printPayslip(payslip: PayslipRecord) {
  const printWindow = window.open("", "_blank", "width=900,height=1100");
  if (!printWindow) return;
  printWindow.document.write(`
    <html>
      <head>
        <title>${payslip.payslipNumber}</title>
        <style>${document.querySelector("style")?.innerHTML || ""}</style>
        <link rel="stylesheet" href="/_next/static/css/app/layout.css" />
      </head>
      <body><main class="payroll-print-root">${document.querySelector("[data-print-payslip]")?.outerHTML || ""}</main></body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  const images = Array.from(printWindow.document.images);
  Promise.all(
    images.map((image) =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          }),
    ),
  ).finally(() => setTimeout(() => printWindow.print(), 100));
}

export default function PayrollModule({ mode }: PayrollModuleProps) {
  const [draft, setDraft] = useState<PayrollDraft>(() => defaultPayrollDraft());
  const [employeeOptions, setEmployeeOptions] = useState(getPayrollEmployees());
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [payslips, setPayslips] = useState<PayslipRecord[]>([]);
  const [selectedPayslipId, setSelectedPayslipId] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadPayrollWorkspace();
  }, []);

  const employee = useMemo(
    () =>
      employeeOptions.find((item) => item.id === draft.employeeId) ||
      employeeOptions[0],
    [draft.employeeId, employeeOptions],
  );
  const previewRecord = useMemo(
    () => buildPayrollRecord(employee, draft, records),
    [draft, employee, records],
  );
  const activePayslip = useMemo(
    () =>
      payslips.find((item) => item.id === selectedPayslipId) ||
      toPayslip(previewRecord),
    [payslips, previewRecord, selectedPayslipId],
  );
  const branchTotals = useMemo(() => {
    return records.reduce<Record<string, number>>((totals, record) => {
      totals[record.employee.branchName] =
        (totals[record.employee.branchName] || 0) + record.netSalary;
      return totals;
    }, {});
  }, [records]);

  function updateDraft(field: keyof PayrollDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [field]:
        field === "employeeId" || field === "month"
          ? value
          : Number(value || 0),
    }));
  }

  async function loadPayrollWorkspace() {
    setLoading(true);
    setError("");
    try {
      const [usersData, branchesData, payrollData] = await Promise.all([
        mongoList<{
          _id: string;
          name: string;
          email: string;
          role: string;
          branchId?: string | null;
          phone?: string;
          profile?: string;
          employeeId?: string;
          salary?: number;
          createdAt?: string;
        }>("users", { limit: 500 }),
        mongoList<{ _id: string; name: string; address?: string }>("branches", {
          limit: 500,
        }),
        mongoList<{
          _id: string;
          userId: string;
          month: string;
          createdAt?: string;
        }>("payrolls", { limit: 500, sort: "-createdAt" }),
      ]);
      const employees = mongoUsersToPayrollEmployees(
        usersData.users || [],
        branchesData.branches || [],
      );
      const employeeById = new Map(employees.map((item) => [item.id, item]));
      const nextRecords: PayrollRecord[] = [];
      for (const row of payrollData.payrolls || []) {
        const employee = employeeById.get(String(row.userId));
        if (employee)
          nextRecords.push(
            mongoPayrollToRecord(row as never, employee, nextRecords),
          );
      }
      const nextPayslips = recordsToPayslips(nextRecords);
      setEmployeeOptions(employees);
      setRecords(nextRecords);
      setPayslips(nextPayslips);
      setSelectedPayslipId((current) => current || nextPayslips[0]?.id || "");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to load MongoDB payroll data.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function generatePayslip(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    try {
      const record = buildPayrollRecord(employee, draft, records);
      const existing = records.find(
        (item) =>
          item.employeeId === record.employeeId && item.month === record.month,
      );
      const payload = payrollRecordToMongo(record);
      const saved = existing
        ? await mongoUpdate<{
            _id: string;
            userId: string;
            month: string;
            createdAt?: string;
          }>("payrolls", existing.id, payload)
        : await mongoCreate<{
            _id: string;
            userId: string;
            month: string;
            createdAt?: string;
          }>("payrolls", payload);
      const savedRecord = mongoPayrollToRecord(
        saved.item as never,
        employee,
        records.filter((item) => item.id !== existing?.id),
      );
      const nextRecords = [
        savedRecord,
        ...records.filter(
          (item) =>
            item.id !== savedRecord.id &&
            !(
              item.employeeId === savedRecord.employeeId &&
              item.month === savedRecord.month
            ),
        ),
      ];
      const nextPayslips = recordsToPayslips(nextRecords);
      setRecords(nextRecords);
      setPayslips(nextPayslips);
      setSelectedPayslipId(savedRecord.id);
      setNotice("Payslip generated and saved to MongoDB.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save payslip.",
      );
    }
  }

  function exportCsv() {
    downloadBlob(
      new Blob([exportRowsCsv(records)], { type: "text/csv" }),
      "monthly-payroll-report.csv",
    );
  }

  async function exportPdf() {
    downloadBlob(
      await createPayslipPdfBlob(activePayslip),
      `${activePayslip.payslipNumber}.pdf`,
    );
  }

  return (
    <main className="app-shell payroll-page">
      <section className="content payroll-content">
        <div className="hero-panel payroll-hero">
          <div>
            <span className="eyebrow">
              <WalletCards /> Payroll Management
            </span>
            <h1>
              {mode === "payslips" ? "Payslip Center" : "Payroll Dashboard"}
            </h1>
            <p>
              Generate salary, review attendance-linked calculations, save
              payslips, and export payroll reports.
            </p>
          </div>
          <div className="system-card">
            <strong>
              {formatCurrency(
                records.reduce((total, record) => total + record.netSalary, 0),
              )}
            </strong>
            <span>Total net payroll stored in employee_payroll</span>
          </div>
        </div>
        {loading ? (
          <section className="panel">
            <p>Loading MongoDB payroll data...</p>
          </section>
        ) : null}
        {error ? (
          <section className="panel">
            <p className="form-error">{error}</p>
            <button className="ghost-button" onClick={loadPayrollWorkspace}>
              Retry
            </button>
          </section>
        ) : null}

        <div className="stats-grid payroll-stats">
          <Stat label="Employees" value={employeeOptions.length} />
          <Stat label="Payslips" value={payslips.length} />
          <Stat
            label="Total Earnings"
            value={formatCurrency(
              records.reduce(
                (total, record) => total + record.totalEarnings,
                0,
              ),
            )}
          />
          <Stat
            label="Total Deductions"
            value={formatCurrency(
              records.reduce(
                (total, record) => total + record.totalDeductions,
                0,
              ),
            )}
          />
        </div>

        {mode === "payroll" ? (
          <section className="panel payroll-workbench">
            <div className="section-heading">
              <div>
                <h1>Generate Payslip</h1>
                <p>
                  HRA, PF, ESI, gross salary, total deductions, net salary, and
                  YTD salary calculate automatically.
                </p>
              </div>
              <div className="report-actions">
                <button className="ghost-button" onClick={exportCsv}>
                  <FileSpreadsheet /> Excel
                </button>
                <button className="ghost-button" onClick={exportPdf}>
                  <Download /> PDF
                </button>
              </div>
            </div>

            <form className="payroll-form" onSubmit={generatePayslip}>
              <label>
                Employee
                <select
                  value={draft.employeeId}
                  onChange={(event) =>
                    setDraft(
                      defaultPayrollDraft(event.target.value, draft.month),
                    )
                  }
                >
                  {employeeOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.employeeName}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                For the period
                <input
                  type="month"
                  value={draft.month}
                  onChange={(event) => updateDraft("month", event.target.value)}
                />
              </label>
              <label>
                Working Days
                <input
                  type="number"
                  value={draft.workingDays}
                  onChange={(event) =>
                    updateDraft("workingDays", event.target.value)
                  }
                />
              </label>
              <label>
                Present Days
                <input
                  type="number"
                  value={draft.presentDays}
                  onChange={(event) =>
                    updateDraft("presentDays", event.target.value)
                  }
                />
              </label>
              <label>
                Absent Days
                <input
                  type="number"
                  value={draft.absentDays}
                  onChange={(event) =>
                    updateDraft("absentDays", event.target.value)
                  }
                />
              </label>
              <label>
                Leave Days
                <input
                  type="number"
                  value={draft.leaveDays}
                  onChange={(event) =>
                    updateDraft("leaveDays", event.target.value)
                  }
                />
              </label>
              <label>
                Basic Salary
                <input
                  type="number"
                  value={draft.basicSalary}
                  onChange={(event) =>
                    updateDraft("basicSalary", event.target.value)
                  }
                />
              </label>
              <label>
                Incentive Pay
                <input
                  type="number"
                  value={draft.incentivePay}
                  onChange={(event) =>
                    updateDraft("incentivePay", event.target.value)
                  }
                />
              </label>
              <label>
                Bonus
                <input
                  type="number"
                  value={draft.bonus}
                  onChange={(event) => updateDraft("bonus", event.target.value)}
                />
              </label>
              <label>
                Special Allowance
                <input
                  type="number"
                  value={draft.specialAllowance}
                  onChange={(event) =>
                    updateDraft("specialAllowance", event.target.value)
                  }
                />
              </label>
              <label>
                Other Earnings
                <input
                  type="number"
                  value={draft.otherEarnings}
                  onChange={(event) =>
                    updateDraft("otherEarnings", event.target.value)
                  }
                />
              </label>
              <label>
                Professional Tax
                <input
                  type="number"
                  value={draft.professionalTax}
                  onChange={(event) =>
                    updateDraft("professionalTax", event.target.value)
                  }
                />
              </label>
              <label>
                Salary Advance
                <input
                  type="number"
                  value={draft.salaryAdvance}
                  onChange={(event) =>
                    updateDraft("salaryAdvance", event.target.value)
                  }
                />
              </label>
              <label>
                Loan
                <input
                  type="number"
                  value={draft.loan}
                  onChange={(event) => updateDraft("loan", event.target.value)}
                />
              </label>
              <label>
                Other Deductions
                <input
                  type="number"
                  value={draft.otherDeductions}
                  onChange={(event) =>
                    updateDraft("otherDeductions", event.target.value)
                  }
                />
              </label>
              <button className="primary-button compact" type="submit">
                <Save /> Generate Payslip
              </button>
            </form>
          </section>
        ) : null}

        <section className="panel">
          <div className="section-heading">
            <div>
              <h1>View Payslip</h1>
              <p>
                Styled to match the uploaded Job Way Tech payslip reference.
              </p>
            </div>
            <div className="report-actions">
              <select
                value={selectedPayslipId}
                onChange={(event) => setSelectedPayslipId(event.target.value)}
                aria-label="Select payslip"
              >
                {payslips.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.employee.employeeName} - {item.month}
                  </option>
                ))}
              </select>
              <button className="ghost-button" onClick={exportPdf}>
                <Download /> Download PDF
              </button>
              <button
                className="ghost-button"
                onClick={() => printPayslip(activePayslip)}
              >
                <Printer /> Print
              </button>
            </div>
          </div>
          <PayslipView payslip={activePayslip} />
        </section>

        <section className="panel">
          <div className="section-heading">
            <div>
              <h1>Payroll History</h1>
              <p>Monthly, employee, and branch-wise payroll summaries.</p>
            </div>
          </div>
          <div className="table-list">
            {records.map((record) => (
              <article className="table-row" key={record.id}>
                <strong>{record.employee.employeeName}</strong>
                <span>
                  {record.month} - {record.employee.employeeId}
                </span>
                <span>{record.employee.branchName}</span>
                <span>Net {formatCurrency(record.netSalary)}</span>
                <button
                  className="ghost-button"
                  onClick={() => setSelectedPayslipId(record.id)}
                >
                  <Eye /> View
                </button>
              </article>
            ))}
          </div>
          <div className="branch-report-grid">
            {Object.entries(branchTotals).map(([branch, total]) => (
              <article className="system-card" key={branch}>
                <strong>{branch}</strong>
                <span>Branch-wise net payroll: {formatCurrency(total)}</span>
              </article>
            ))}
          </div>
        </section>
        {notice ? <div className="toast">{notice}</div> : null}
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="stat-card">
      <WalletCards />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function formatPayslipMonth(month: string) {
  const [yearValue, monthValue] = String(month || "")
    .split("-")
    .map(Number);
  if (!yearValue || !monthValue) return month || "-";
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(yearValue, monthValue - 1, 1)));
}

function formatPayslipDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatPayslipRangeDate(value: string) {
  const [day, month, year] = value.split("-").map(Number);
  if (!day || !month || !year) return value || "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatPaymentDate(month: string) {
  const [yearValue, monthValue] = String(month || "")
    .split("-")
    .map(Number);
  if (!yearValue || !monthValue) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(yearValue, monthValue, 1)));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(value || 0),
  );
}

function numberToWords(value: number) {
  const ones = [
    "",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = [
    "",
    "",
    "Twenty",
    "Thirty",
    "Forty",
    "Fifty",
    "Sixty",
    "Seventy",
    "Eighty",
    "Ninety",
  ];
  const belowHundred = (amount: number) =>
    amount < 20
      ? ones[amount]
      : [tens[Math.floor(amount / 10)], ones[amount % 10]]
          .filter(Boolean)
          .join(" ");
  const belowThousand = (amount: number) =>
    amount >= 100
      ? [ones[Math.floor(amount / 100)], "Hundred", belowHundred(amount % 100)]
          .filter(Boolean)
          .join(" ")
      : belowHundred(amount);
  const rounded = Math.round(value || 0);
  if (!rounded) return "Zero";
  const parts = [
    [Math.floor(rounded / 10000000), "Crore"],
    [Math.floor((rounded % 10000000) / 100000), "Lakh"],
    [Math.floor((rounded % 100000) / 1000), "Thousand"],
    [rounded % 1000, ""],
  ];
  return parts
    .map(([amount, label]) =>
      Number(amount)
        ? `${belowThousand(Number(amount))}${label ? ` ${label}` : ""}`
        : "",
    )
    .filter(Boolean)
    .join(" ");
}

function PayslipView({ payslip }: { payslip: PayslipRecord }) {
  const payrollPeriod = formatPayrollPeriodRange(payslip.month);
  const payslipMonth = formatPayslipMonth(payslip.month);
  const displayedNet = Math.max(0, payslip.netSalary);
  const earningRows = [
    ["Basic Salary", payslip.earnings.basicSalary],
    ["House Rent Allowance (HRA)", payslip.earnings.hra],
    ["Conveyance Allowance", payslip.earnings.incentivePay],
    ["Medical Allowance", payslip.earnings.bonus],
    ["Special Allowance", payslip.earnings.specialAllowance],
  ];
  const deductionRows = [
    ["Employee PF", payslip.deductions.providentFund],
    ["Employee ESIC", payslip.deductions.esi],
    ["Professional Tax", payslip.deductions.professionalTax],
  ];
  const employeeDetails = [
    [
      [
        "Employee Name",
        payslip.employee.employeeName || "Mr./Ms. Sample Employee",
      ],
      ["Employee ID", payslip.employee.employeeId || "JWT/EMP/001"],
    ],
    [
      ["Designation", payslip.employee.designation || "HR Executive"],
      ["Department", payslip.employee.department || "Human Resources"],
    ],
    [
      ["Date of Joining", formatPayslipDate(payslip.employee.dateOfJoining)],
      ["Work Location", payslip.employee.branchName || "Madanapalle"],
    ],
    [
      ["Employment Type", "Full Time"],
      ["PAN Number", "ABCDE1234F"],
    ],
    [
      ["Bank Name", "HDFC Bank"],
      ["Bank Account No", "XXXXXX1234"],
    ],
    [
      ["Total Month Days", payslip.attendance.workingDays || 31],
      [
        "Paid Days",
        payslip.attendance.presentDays || payslip.attendance.workingDays || 31,
      ],
    ],
  ];

  return (
    <article className="payslip-sheet" data-print-payslip>
      <header className="payslip-header">
        <Image
          className="payslip-logo"
          src={JOBWAYTECH_LOGO_SRC}
          alt={JOBWAYTECH_LOGO_ALT}
          width={84}
          height={84}
          unoptimized
        />
        <div className="payslip-brand">
          <h2>JOB WAY TECH CONSULTANT &amp; TRAINING</h2>
          <strong>Monthly Salary Slip / Payslip</strong>
          <span>
            Address: 429-A-24, Indira Nagar, Krishna Nagar, Madanapalle,
            <br />
            Andhra Pradesh - 517325
          </span>
        </div>
        <strong className="payslip-month">{payslipMonth}</strong>
      </header>

      <section className="payslip-info-grid">
        <PayslipInfoCell label="Payslip Month" value={payslipMonth} />
        <PayslipInfoCell
          label="Pay Period"
          value={`${formatPayslipRangeDate(payrollPeriod.from)} to ${formatPayslipRangeDate(payrollPeriod.to)}`}
        />
        <PayslipInfoCell
          label="Salary Payment Date"
          value={formatPaymentDate(payslip.month)}
        />
        <PayslipInfoCell
          label="Payslip No."
          value={payslip.payslipNumber.replace("JWT-", "JWT/PAY/")}
        />
        <PayslipInfoCell label="Payment Mode" value="Bank Transfer" />
      </section>

      <section className="payslip-section">
        <h3>Employee Details</h3>
        <div className="payslip-detail-table">
          {employeeDetails.map((row) =>
            row.map(([label, value]) => (
              <PayslipInfoCell
                key={label}
                label={String(label)}
                value={String(value)}
              />
            )),
          )}
        </div>
      </section>

      <div className="payslip-ledger">
        <PayslipTable
          title="Earnings"
          labelTitle="Salary Component"
          rows={earningRows}
        />
        <PayslipTable
          title="Deductions"
          labelTitle="Deduction Component"
          rows={deductionRows}
        />
      </div>

      <div className="payslip-bottom-grid">
        <table className="payslip-table payslip-summary-table">
          <tbody>
            <tr className="payslip-total-row">
              <td>Net Salary</td>
              <td>{formatAmount(displayedNet)}</td>
            </tr>
            <tr>
              <td>Employer PF Contribution</td>
              <td>{formatAmount(payslip.deductions.providentFund)}</td>
            </tr>
            <tr>
              <td>Employer ESIC Contribution</td>
              <td>{formatAmount(payslip.deductions.esi)}</td>
            </tr>
            <tr className="payslip-total-row">
              <td>Gross Salary</td>
              <td>{formatAmount(payslip.totalEarnings)}</td>
            </tr>
          </tbody>
        </table>
        <div className="payslip-payable">
          <div>
            <span>Net Salary Payable</span>
            <strong>
              {"\u20B9"} {formatAmount(displayedNet)}
            </strong>
          </div>
          <p>
            <strong>Amount in Words:</strong>
            <br />
            Rupees {numberToWords(displayedNet)} Only
          </p>
        </div>
      </div>

      <footer className="payslip-footer">
        This is a system-generated payslip and does not require a physical
        signature.
      </footer>
    </article>
  );
}

function PayslipInfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PayslipTable({
  title,
  labelTitle,
  rows,
}: {
  title: string;
  labelTitle: string;
  rows: (string | number)[][];
}) {
  return (
    <section className="payslip-ledger-panel">
      <h3>{title}</h3>
      <table className="payslip-table">
        <thead>
          <tr>
            <th>{labelTitle}</th>
            <th>Amount (Rs.)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={String(label)}>
              <td>{label}</td>
              <td>{formatAmount(Number(value))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
