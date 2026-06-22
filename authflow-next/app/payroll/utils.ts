import type {
  AttendanceDetails,
  Deductions,
  Earnings,
  PayrollDraft,
  PayrollEmployee,
  PayrollRecord,
  PayslipRecord,
} from "./types";

export const JOBWAYTECH_LOGO_SRC =
  "/assets/job-way-tech-logo.png?v=official-20260601";
export const JOBWAYTECH_LOGO_ALT = "Job Way Tech Consultant and Training";

export const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number) {
  return currencyFormatter.format(Math.round(value || 0));
}

export function percentage(presentDays: number, workingDays: number) {
  return workingDays ? Math.round((presentDays / workingDays) * 100) : 0;
}

export function formatPayrollPeriod(month: string) {
  const range = formatPayrollPeriodRange(month);
  return range.label;
}

export function formatPayrollPeriodRange(month: string) {
  const [yearValue, monthValue] = String(month || "")
    .split("-")
    .map(Number);
  if (!yearValue || !monthValue)
    return { from: month || "-", to: month || "-", label: month || "-" };

  const startDate = new Date(Date.UTC(yearValue, monthValue - 1, 1));
  const monthEndDate = new Date(Date.UTC(yearValue, monthValue, 0));
  const endDate = new Date(
    Date.UTC(yearValue, monthValue - 1, monthEndDate.getUTCDate()),
  );
  const formatDate = (date: Date) =>
    [
      String(date.getUTCDate()).padStart(2, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      date.getUTCFullYear(),
    ].join("-");

  const from = formatDate(startDate);
  const to = formatDate(endDate);
  return { from, to, label: `${from} to ${to}` };
}

export function calculateEarnings(draft: PayrollDraft): Earnings {
  const basicSalary = Number(draft.basicSalary || 0);
  return {
    basicSalary,
    hra: Math.round(basicSalary * 0.4),
    incentivePay: Number(draft.incentivePay || 0),
    bonus: Number(draft.bonus || 0),
    specialAllowance: Number(draft.specialAllowance || 0),
    otherEarnings: Number(draft.otherEarnings || 0),
  };
}

export function calculateDeductions(
  draft: PayrollDraft,
  grossSalary: number,
): Deductions {
  const basicSalary = Number(draft.basicSalary || 0);
  return {
    providentFund: Math.round(basicSalary * 0.12),
    esi: grossSalary <= 21000 ? Math.round(grossSalary * 0.0075) : 0,
    professionalTax: Number(draft.professionalTax || 0),
    salaryAdvance: Number(draft.salaryAdvance || 0),
    loan: Number(draft.loan || 0),
    otherDeductions: Number(draft.otherDeductions || 0),
  };
}

export function sumValues(values: Record<string, number>) {
  return Object.values(values).reduce(
    (total, value) => total + Number(value || 0),
    0,
  );
}

export function buildPayrollRecord(
  employee: PayrollEmployee,
  draft: PayrollDraft,
  existingRecords: PayrollRecord[] = [],
): PayrollRecord {
  const attendance: AttendanceDetails = {
    workingDays: Number(draft.workingDays || 0),
    presentDays: Number(draft.presentDays || 0),
    absentDays: Number(draft.absentDays || 0),
    leaveDays: Number(draft.leaveDays || 0),
    attendancePercentage: percentage(
      Number(draft.presentDays || 0),
      Number(draft.workingDays || 0),
    ),
  };
  const earnings = calculateEarnings(draft);
  const grossSalary = sumValues(earnings);
  const deductions = calculateDeductions(draft, grossSalary);
  const totalDeductions = sumValues(deductions);
  const netSalary = grossSalary - totalDeductions;
  const ytdNetSalary = existingRecords
    .filter(
      (record) =>
        record.employeeId === employee.id &&
        record.month.slice(0, 4) === draft.month.slice(0, 4),
    )
    .reduce((total, record) => total + record.netSalary, netSalary);

  return {
    id: `pay-${employee.employeeId}-${draft.month}-${Date.now()}`,
    employeeId: employee.id,
    month: draft.month,
    employee,
    attendance,
    earnings,
    deductions,
    grossSalary,
    totalEarnings: grossSalary,
    totalDeductions,
    netSalary,
    ytdNetSalary,
    createdAt: new Date().toISOString(),
  };
}

export function toPayslip(record: PayrollRecord): PayslipRecord {
  return {
    ...record,
    payslipNumber: `JWT-${record.month.replace("-", "")}-${record.employee.employeeId}`,
    status: "generated",
  };
}

function pdfEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

type PdfLogoImage = {
  bytes: Uint8Array;
  width: number;
  height: number;
};

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function loadPdfLogoImage(
  source = JOBWAYTECH_LOGO_SRC,
): Promise<PdfLogoImage> {
  const response = await fetch(source);
  if (!response.ok)
    throw new Error(`Unable to load payslip logo from ${source}`);

  const logoBlob = await response.blob();
  const imageUrl = URL.createObjectURL(logoBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error(`Unable to decode payslip logo from ${source}`));
      image.src = imageUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || 420;
    canvas.height = image.naturalHeight || 90;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Unable to render payslip logo for PDF export");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
    return {
      bytes: base64ToBytes(dataUrl.split(",")[1] || ""),
      width: canvas.width,
      height: canvas.height,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function buildPdf(
  parts: (string | Uint8Array)[],
  objectOffsets: number[],
  objectCount: number,
) {
  const encoder = new TextEncoder();
  const outputParts: Uint8Array[] = [];
  let byteLength = 0;
  const add = (part: string | Uint8Array) => {
    const bytes = typeof part === "string" ? encoder.encode(part) : part;
    outputParts.push(bytes);
    byteLength += bytes.length;
  };

  parts.forEach((part) => add(part));
  const xrefOffset = byteLength;
  add(`xref\n0 ${objectCount + 1}\n0000000000 65535 f \n`);
  objectOffsets.forEach((offset) =>
    add(`${String(offset).padStart(10, "0")} 00000 n \n`),
  );
  add(
    `trailer << /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  );

  const blobParts = outputParts.map(
    (bytes) =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  );
  return new Blob(blobParts, { type: "application/pdf" });
}

export async function createPayslipPdfBlob(payslip: PayslipRecord) {
  const logo = await loadPdfLogoImage();
  const period = formatPayrollPeriodRange(payslip.month);
  const [yearValue, monthValue] = String(payslip.month || "")
    .split("-")
    .map(Number);
  const monthDate =
    yearValue && monthValue
      ? new Date(Date.UTC(yearValue, monthValue - 1, 1))
      : new Date();
  const payslipMonth = new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(monthDate);
  const paymentDate =
    yearValue && monthValue
      ? new Intl.DateTimeFormat("en-IN", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(Date.UTC(yearValue, monthValue, 1)))
      : "-";
  const formatRangeDate = (value: string) => {
    const [day, month, year] = value.split("-").map(Number);
    if (!day || !month || !year) return value || "-";
    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  };
  const formatAmount = (value: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
      Math.round(value || 0),
    );
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
  const amountInWords = (value: number) => {
    const rounded = Math.round(value || 0);
    if (!rounded) return "Zero";
    return [
      [Math.floor(rounded / 10000000), "Crore"],
      [Math.floor((rounded % 10000000) / 100000), "Lakh"],
      [Math.floor((rounded % 100000) / 1000), "Thousand"],
      [rounded % 1000, ""],
    ]
      .map(([amount, label]) =>
        Number(amount)
          ? `${belowThousand(Number(amount))}${label ? ` ${label}` : ""}`
          : "",
      )
      .filter(Boolean)
      .join(" ");
  };
  const logoHeight = 58;
  const logoWidth = Math.round((logo.width / logo.height) * logoHeight);
  const commands: string[] = [];
  const text = (value: string, x: number, y: number, size = 11, font = "F1") =>
    commands.push(
      `BT /${font} ${size} Tf ${x} ${y} Td (${pdfEscape(value)}) Tj ET`,
    );
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    commands.push(`${x1} ${y1} m ${x2} ${y2} l S`);
  const rect = (
    x: number,
    y: number,
    width: number,
    height: number,
    fill = false,
  ) => commands.push(`${x} ${y} ${width} ${height} re ${fill ? "f" : "S"}`);
  const black = () => commands.push("0 0 0 rg 0.61 0.64 0.69 RG 0.7 w");
  const blueStroke = () => commands.push("0 0 0 rg 0.04 0.25 0.53 RG 1.1 w");
  const blueFill = () => commands.push("0.03 0.25 0.53 rg");
  const paleFill = () => commands.push("0.92 0.95 0.98 rg");
  const totalFill = () => commands.push("0.86 0.93 0.79 rg");
  const white = () => commands.push("1 1 1 rg");
  const tableCell = (
    label: string,
    value: string,
    x: number,
    y: number,
    width = 256,
  ) => {
    paleFill();
    rect(x, y, 110, 24, true);
    black();
    rect(x, y, width, 24);
    line(x + 110, y, x + 110, y + 24);
    text(label, x + 8, y + 9, 8, "F2");
    text(value, x + 120, y + 9, 8);
  };
  const amountCell = (
    label: string,
    value: number,
    x: number,
    y: number,
    width = 242,
  ) => {
    black();
    rect(x, y, width, 25);
    line(x + width - 86, y, x + width - 86, y + 25);
    text(label, x + 8, y + 9, 8);
    text(formatAmount(value), x + width - 70, y + 9, 8, "F2");
  };

  blueStroke();
  rect(34, 736, 544, 88);
  commands.push(`q ${logoWidth} 0 0 ${logoHeight} 50 754 cm /Im1 Do Q`);
  black();
  text("JOB WAY TECH CONSULTANT & TRAINING", 160, 797, 16, "F2");
  text("Monthly Salary Slip / Payslip", 230, 777, 11, "F2");
  text(
    "Address: 429-A-24, Indira Nagar, Krishna Nagar, Madanapalle,",
    196,
    760,
    7,
  );
  text("Andhra Pradesh - 517325", 258, 750, 7);
  text(payslipMonth, 520, 782, 9, "F2");

  tableCell("Payslip Month", payslipMonth, 34, 698, 272);
  tableCell(
    "Pay Period",
    `${formatRangeDate(period.from)} to ${formatRangeDate(period.to)}`,
    306,
    698,
    272,
  );
  tableCell("Salary Payment Date", paymentDate, 34, 674, 272);
  tableCell(
    "Payslip No.",
    payslip.payslipNumber.replace("JWT-", "JWT/PAY/"),
    306,
    674,
    272,
  );
  tableCell("Payment Mode", "Bank Transfer", 34, 650, 544);

  blueFill();
  rect(34, 612, 544, 22, true);
  white();
  text("EMPLOYEE DETAILS", 46, 620, 10, "F2");
  black();
  [
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
      ["Date of Joining", payslip.employee.dateOfJoining || "-"],
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
      ["Total Month Days", String(payslip.attendance.workingDays || 31)],
      [
        "Paid Days",
        String(
          payslip.attendance.presentDays ||
            payslip.attendance.workingDays ||
            31,
        ),
      ],
    ],
  ].forEach((row, index) => {
    const y = 588 - index * 24;
    tableCell(String(row[0][0]), String(row[0][1]), 34, y, 272);
    tableCell(String(row[1][0]), String(row[1][1]), 306, y, 272);
  });

  const tableTop = 420;
  blueFill();
  rect(34, tableTop, 260, 22, true);
  rect(314, tableTop, 264, 22, true);
  white();
  text("EARNINGS", 46, tableTop + 8, 10, "F2");
  text("DEDUCTIONS", 326, tableTop + 8, 10, "F2");
  black();
  const earnings = [
    ["Basic Salary", payslip.earnings.basicSalary],
    ["House Rent Allowance (HRA)", payslip.earnings.hra],
    ["Conveyance Allowance", payslip.earnings.incentivePay],
    ["Medical Allowance", payslip.earnings.bonus],
    ["Special Allowance", payslip.earnings.specialAllowance],
  ];
  const deductions = [
    ["Employee PF", payslip.deductions.providentFund],
    ["Employee ESIC", payslip.deductions.esi],
    ["Professional Tax", payslip.deductions.professionalTax],
  ];
  paleFill();
  rect(34, 396, 260, 24, true);
  rect(314, 396, 264, 24, true);
  black();
  rect(34, 396, 260, 24);
  rect(314, 396, 264, 24);
  line(188, 396, 188, 420);
  line(478, 396, 478, 420);
  text("Salary Component", 46, 405, 8, "F2");
  text("Amount (Rs.)", 208, 405, 8, "F2");
  text("Deduction Component", 326, 405, 8, "F2");
  text("Amount (Rs.)", 498, 405, 8, "F2");
  earnings.forEach(([label, value], index) => {
    amountCell(String(label), Number(value), 34, 371 - index * 25, 260);
  });
  deductions.forEach(([label, value], index) => {
    amountCell(String(label), Number(value), 314, 371 - index * 25, 264);
  });
  totalFill();
  rect(34, 246, 260, 25, true);
  rect(314, 296, 264, 25, true);
  black();
  rect(34, 246, 260, 25);
  line(188, 246, 188, 271);
  text("Net Salary", 46, 255, 8, "F2");
  text(formatAmount(payslip.netSalary), 208, 255, 8, "F2");
  amountCell(
    "Employer PF Contribution",
    payslip.deductions.providentFund,
    34,
    221,
    260,
  );
  amountCell(
    "Employer ESIC Contribution",
    payslip.deductions.esi,
    34,
    196,
    260,
  );
  totalFill();
  rect(34, 171, 260, 25, true);
  black();
  rect(34, 171, 260, 25);
  line(188, 171, 188, 196);
  text("Gross Salary", 46, 180, 8, "F2");
  text(formatAmount(payslip.totalEarnings), 208, 180, 8, "F2");

  totalFill();
  rect(314, 246, 264, 30, true);
  black();
  rect(314, 246, 264, 30);
  line(478, 246, 478, 276);
  text("NET SALARY PAYABLE", 326, 257, 10, "F2");
  text(`Rs. ${formatAmount(payslip.netSalary)}`, 500, 257, 11, "F2");
  text("Amount in Words:", 314, 220, 8, "F2");
  text(`Rupees ${amountInWords(payslip.netSalary)} Only`, 314, 207, 8);

  commands.push("0.61 0.64 0.69 RG 0.7 w [3 3] 0 d");
  line(34, 88, 578, 88);
  commands.push("[] 0 d");
  black();
  text(
    "This is a system-generated payslip and does not require a physical signature.",
    144,
    60,
    8,
    "F2",
  );

  const stream = commands.join("\n");
  const encoder = new TextEncoder();
  const parts: (string | Uint8Array)[] = ["%PDF-1.4\n"];
  const objectOffsets: number[] = [];
  let byteOffset = encoder.encode("%PDF-1.4\n").length;
  const addObject = (...objectParts: (string | Uint8Array)[]) => {
    objectOffsets.push(byteOffset);
    for (const part of objectParts)
      byteOffset +=
        typeof part === "string" ? encoder.encode(part).length : part.length;
    parts.push(...objectParts);
  };

  addObject("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n");
  addObject("2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n");
  addObject(
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 7 0 R >> endobj\n",
  );
  addObject(
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  );
  addObject(
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> endobj\n",
  );
  addObject(
    `6 0 obj << /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >> stream\n`,
    logo.bytes,
    "\nendstream endobj\n",
  );
  addObject(
    `7 0 obj << /Length ${encoder.encode(stream).length} >> stream\n${stream}\nendstream endobj\n`,
  );

  return buildPdf(parts, objectOffsets, 7);
}

export function exportRowsCsv(rows: PayrollRecord[]) {
  const header = [
    "Month",
    "Employee",
    "Employee ID",
    "Branch",
    "Gross Salary",
    "Deductions",
    "Net Salary",
    "YTD Net Salary",
  ];
  const body = rows.map((row) => [
    row.month,
    row.employee.employeeName,
    row.employee.employeeId,
    row.employee.branchName,
    row.totalEarnings,
    row.totalDeductions,
    row.netSalary,
    row.ytdNetSalary,
  ]);
  return [header, ...body]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}
