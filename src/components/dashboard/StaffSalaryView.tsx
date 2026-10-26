import React, { useState, useEffect } from 'react';
import { FileText, Loader2, Printer, Ban, Clock, CheckCircle, Download, Banknote } from 'lucide-react';
import * as XLSX from 'xlsx';
import html2pdf from 'html2pdf.js';
import { staffApi, Staff, SalarySlip } from '@/lib/api';
import toast from 'react-hot-toast';

const StaffSalaryView = () => {
    const [viewMode, setViewMode] = useState<'individual' | 'bulk'>('individual');
    const [staffList, setStaffList] = useState<Staff[]>([]);
    const [selectedStaffId, setSelectedStaffId] = useState('');
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [salarySlip, setSalarySlip] = useState<SalarySlip | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        fetchStaff();
    }, []);

    const fetchStaff = async () => {
        try {
            const res = await staffApi.getAll();
            if (Array.isArray(res.data)) {
                setStaffList(res.data);
            }
        } catch (error) {
            toast.error("Failed to load staff list");
        }
    };

    const handleGenerateSlip = async () => {
        if (!selectedStaffId || !selectedMonth) return;
        setLoading(true);
        try {
            // Fetch slip and attendance in parallel for accurate permission calculation
            const [slipRes, attendanceRes] = await Promise.all([
                staffApi.getSalarySlip(selectedStaffId, selectedMonth),
                staffApi.getStaffMonthAttendance(selectedStaffId, selectedMonth)
            ]);

            let slip = slipRes.data;
            const attendanceData = attendanceRes.data;

            // Parse attendance to calculate actual permission hours
            let calculatedPermHours = 0;
            let attendanceList: any[] = [];
            if (attendanceData && typeof attendanceData === 'object' && !Array.isArray(attendanceData)) {
                attendanceList = Object.values(attendanceData);
            } else if (Array.isArray(attendanceData)) {
                attendanceList = attendanceData;
            }

            attendanceList.forEach((record: any) => {
                const status = record.status || record.type;
                if (status === 'PERMISSION') {
                    let hours = 0;

                    // New: Parse "HH:mm - HH:mm"
                    if (record.permissionTimeRange && record.permissionTimeRange.includes('-')) {
                        try {
                            const parts = record.permissionTimeRange.split('-').map((s: string) => s.trim());
                            if (parts.length === 2) {
                                const parseTime = (t: string) => {
                                    const [h, m] = t.split(':').map(Number);
                                    return (h || 0) + (m || 0) / 60;
                                };
                                const start = parseTime(parts[0]);
                                const end = parseTime(parts[1]);
                                if (!isNaN(start) && !isNaN(end) && end > start) {
                                    hours = end - start;
                                }
                            }
                        } catch (e) {
                            console.warn("Failed to parse time range", record.permissionTimeRange);
                        }
                    }

                    // Fallback / Legacy: Parse numeric value from permissionTime
                    if (hours <= 0 && record.permissionTime) {
                        const match = record.permissionTime.toString().match(/(\d+(\.\d+)?)/);
                        if (match) {
                            hours = parseFloat(match[0]);
                        }
                    }

                    if (hours > 0) calculatedPermHours += hours;
                }
            });

            // Apply frontend calculation for permission hours
            if (calculatedPermHours > 0) {
                slip.permissionHoursTaken = calculatedPermHours;

                // Get allowed hours to recalculate deduction
                const staffMember = staffList.find(s => s.id === selectedStaffId);
                const allowed = staffMember?.allowedPermHours || 0;

                if (calculatedPermHours > allowed) {
                    const excess = calculatedPermHours - allowed;
                    // Ensure perHourSalary exists, otherwise calculate it
                    const hourlyRate = slip.perHourSalary || (slip.perDaySalary / 9); // Assuming 9 hour day if missing
                    const deduction = excess * hourlyRate;
                    slip.permissionDeduction = deduction;
                } else {
                    slip.permissionDeduction = 0;
                }

                // Recalculate Net Salary
                slip.netSalary = slip.baseSalary
                    - (slip.lopAmount + slip.permissionDeduction);

            }

            // Fetch Commissions separate state for context
            let fetchedCommissions: any[] = [];
            try {
                const commRes = await staffApi.getStaffCommissions(selectedStaffId, selectedMonth);
                fetchedCommissions = commRes.data || [];
                setCommissions(fetchedCommissions);
            } catch (e) {
                console.warn("Failed to fetch commission details", e);
                setCommissions([]);
            }

            const totalCommissions = fetchedCommissions.reduce((acc: number, c: any) => acc + (c.staffCommissionAmount || c.amount || 0), 0);
            (slip as any).totalCommissions = totalCommissions;
            slip.netSalary = slip.baseSalary - (slip.lopAmount + (slip.permissionDeduction || 0)) + totalCommissions;

            setSalarySlip(slip);
            toast.success("Salary slip generated");
        } catch (error: any) {
            console.error(error);
            toast.error(error.response?.data?.error || "Failed to generate slip");
            setSalarySlip(null);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = () => {
        const element = document.getElementById('salary-slip');
        if (!element) return;

        const fileName = `SalarySlip_${salarySlip?.staffName}_${selectedMonth}.pdf`;

        const opt = {
            filename: fileName,
            image: { type: 'jpeg' as const, quality: 1 },
            html2canvas: { scale: 3, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        html2pdf()
            .from(element)
            .set(opt)
            .outputPdf('blob')
            .then((pdfBlob: Blob) => {
                const url = URL.createObjectURL(pdfBlob);

                // Open PDF in new TAB
                const pdfTab = window.open(url, '_blank');

                if (!pdfTab) {
                    toast.error("Popup blocked! Please allow pop-ups for printing.");
                    return;
                }

                // Trigger print after tab finishes loading PDF
                pdfTab.onload = () => {
                    pdfTab.document.title = fileName; // Shows filename in tab
                    pdfTab.focus();
                    pdfTab.print();
                };
            });
    };


    const handleExportExcel = () => {
        if (viewMode === 'bulk' && bulkReport.length > 0) {
            const dataToExport = bulkReport.map(slip => ({
                'Staff ID': slip.staffId,
                'Name': slip.staffName,
                'Base Salary': slip.baseSalary,
                'Present Days': slip.presentDays,
                'Absent Days': slip.absentDays,
                'Half Days': slip.halfDays,
                'Deductions': ((slip.lopAmount || 0) + (slip.permissionDeduction || 0)).toFixed(2),
                'Net Salary': Math.round(slip.netSalary || 0)
            }));

            // Add Total Row
            const totalPayout = bulkReport.reduce((acc, curr) => acc + Math.round(curr.netSalary), 0);
            dataToExport.push({
                'Staff ID': 'TOTAL',
                'Name': '',
                'Base Salary': 0,
                'Present Days': 0,
                'Absent Days': 0,
                'Half Days': 0,
                'Deductions': '',
                'Net Salary': totalPayout
            });

            const ws = XLSX.utils.json_to_sheet(dataToExport);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Salary Report");
            XLSX.writeFile(wb, `Salary_Report_${selectedMonth}.xlsx`);
            toast.success("Report downloaded as Excel");
        }
    };

    const handleProcessPayout = async () => {
        if (!salarySlip || commissions.length === 0) {
            toast.error("No commissions to payout.");
            return;
        }
        
        try {
            setLoading(true);
            const unpaidComms = commissions.filter(c => c.status !== 'PAID');
            for (const comm of unpaidComms) {
                await staffApi.payCommission(comm.id || comm._id, 'CASH');
            }
            toast.success("Payout processed successfully. Commissions marked as PAID.");
            handleGenerateSlip(); // Refresh
        } catch (error) {
            console.error("Payout error", error);
            toast.error("Failed to process payout");
        } finally {
            setLoading(false);
        }
    };

    // Bulk Report State
    const [bulkReport, setBulkReport] = useState<SalarySlip[]>([]);
    const [commissions, setCommissions] = useState<any[]>([]);

    const generateBulkReport = async () => {
        setLoading(true);
        setBulkReport([]);
        try {
            const report: SalarySlip[] = [];
            for (const s of staffList) {
                if (!s.isActive) continue;
                try {
                    const res = await staffApi.getSalarySlip(s.id, selectedMonth);
                    if (res.data) report.push(res.data);
                } catch (e) {
                    console.error(`Failed for ${s.name}`, e);
                }
            }
            setBulkReport(report);
            if (report.length > 0) toast.success("Bulk report generated");
            else toast.error("No data found for any staff");
        } catch (e) {
            toast.error("Failed to generate bulk report");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full flex flex-col space-y-6">
            {/* --- Controls Section --- */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 print:hidden flex flex-wrap gap-4 items-end">
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button onClick={() => setViewMode('individual')} className={`px-3 py-1.5 text-sm rounded-md transition-all ${viewMode === 'individual' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}>Individual Slip</button>
                    <button onClick={() => setViewMode('bulk')} className={`px-3 py-1.5 text-sm rounded-md transition-all ${viewMode === 'bulk' ? 'bg-white shadow text-blue-600 font-bold' : 'text-gray-500 hover:text-gray-700'}`}>Bulk Report</button>
                </div>

                <div className="flex-1 min-w-[200px]">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Select Month</label>
                    <input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                </div>

                {viewMode === 'individual' && (
                    <div className="flex-1 min-w-[200px]">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Staff</label>
                        <select
                            value={selectedStaffId}
                            onChange={(e) => setSelectedStaffId(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg p-2.5 bg-gray-50 focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">-- Select Staff Member --</option>
                            {staffList.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                            ))}
                        </select>
                    </div>
                )}

                <div className="flex gap-2">
                    <button
                        onClick={viewMode === 'individual' ? handleGenerateSlip : generateBulkReport}
                        disabled={loading || (viewMode === 'individual' && !selectedStaffId)}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
                        {viewMode === 'individual' ? 'Generate Slip' : 'Generate Report'}
                    </button>

                    {(salarySlip && viewMode === 'individual') && (
                        <>
                            <button
                                onClick={handleProcessPayout}
                                disabled={loading || !commissions.some(c => c.status !== 'PAID')}
                                className="bg-emerald-600 text-white px-3 py-1.5 text-sm.5 rounded-lg font-medium hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-50"
                            >
                                <Banknote size={20} /> Process Payout
                            </button>
                            <button
                                onClick={handleDownloadPDF}
                                className="bg-purple-600 text-white px-3 py-1.5 text-sm.5 rounded-lg font-medium hover:bg-purple-700 flex items-center gap-2"
                            >
                                <Printer size={20} /> Print
                            </button>
                        </>
                    )}

                    {(viewMode === 'bulk' && bulkReport.length > 0) && (
                        <button
                            onClick={handleExportExcel}
                            className="bg-green-600 text-white px-3 py-1.5 text-sm.5 rounded-lg font-medium hover:bg-green-700 flex items-center gap-2"
                        >
                            <Download size={20} /> Export to Excel
                        </button>
                    )}
                </div>
            </div>

            {/* --- Salary Details / Slip --- */}
            <div className="flex-1 bg-gray-50 flex justify-center overflow-auto py-8 print:bg-white print:overflow-visible print:py-0">
                {viewMode === 'individual' ? (
                    salarySlip ? (
                        <div id="salary-slip" className="salary-slip-container shadow-2xl">
                            <div className="bg-white p-8 rounded-xl h-full">

                                {/* Header */}
                                <div className="border-b-2 border-slate-800 pb-4 mb-6 flex justify-between items-start">
                                    <div>
                                        <h1 className="text-3xl font-bold text-slate-900 uppercase tracking-wide">Salary Slip</h1>
                                        <p className="text-slate-500 font-medium mt-1">Pay Period: <span className="text-slate-900">{salarySlip.month}</span></p>
                                    </div>
                                    <div className="text-right">
                                        <h2 className="text-xl font-semibold text-slate-800">{salarySlip.staffName}</h2>
                                        <p className="text-sm text-slate-500">ID: {salarySlip.staffId}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-8 mb-8">
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                        <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-1">Base Salary</p>
                                        <p className="text-2xl font-bold text-slate-800">₹{salarySlip.baseSalary?.toLocaleString()}</p>
                                    </div>
                                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
                                        <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-1">Per Day Rate</p>
                                        <p className="text-2xl font-bold text-slate-800">₹{(salarySlip.perDaySalary || 0).toFixed(2)}</p>
                                    </div>
                                    <div className="p-4 bg-slate-100 rounded-lg border border-slate-200 opacity-75">
                                        <p className="text-sm text-slate-500 uppercase font-semibold tracking-wider mb-1">Net Pay</p>
                                        <p className="text-2xl font-bold text-slate-800">₹{Math.round(salarySlip.netSalary).toLocaleString()}</p>
                                    </div>
                                </div>

                                {/* Attendance Summary */}
                                <div className="mb-8">
                                    <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <Clock size={20} className="text-blue-600" /> Attendance Summary
                                    </h3>
                                    <div className="grid grid-cols-4 gap-4 text-center">
                                        <div className="p-3 bg-green-50 rounded-lg border border-green-100">
                                            <p className="text-2xl font-bold text-green-700">{salarySlip.presentDays}</p>
                                            <p className="text-xs font-semibold text-green-800 uppercase">Present Days</p>
                                        </div>
                                        <div className="p-3 bg-red-50 rounded-lg border border-red-100">
                                            <p className="text-2xl font-bold text-red-700">{salarySlip.absentDays}</p>
                                            <p className="text-xs font-semibold text-red-800 uppercase">Absent Days</p>
                                        </div>
                                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-100">
                                            <p className="text-2xl font-bold text-orange-700">{salarySlip.halfDays}</p>
                                            <p className="text-xs font-semibold text-orange-800 uppercase">Half Days</p>
                                        </div>
                                        <div className="p-3 bg-blue-50 rounded-lg border border-blue-100">
                                            <p className="text-2xl font-bold text-blue-700">
                                                {salarySlip.permissionHoursTaken || 0}
                                                <span className="text-sm font-medium text-blue-500">
                                                    / {staffList.find(s => s.id === selectedStaffId)?.allowedPermHours || 0}
                                                </span> hrs
                                            </p>
                                            <p className="text-xs font-semibold text-blue-800 uppercase">Permission</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Deductions Table */}
                                <div className="mb-8">
                                    <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
                                        <Ban size={20} className="text-red-600" /> Deductions
                                    </h3>
                                    <table className="w-full text-left text-sm border-collapse">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="p-3 font-semibold text-slate-700">Description</th>
                                                <th className="p-3 font-semibold text-slate-700 text-right">Count</th>
                                                <th className="p-3 font-semibold text-slate-700 text-right">Calculation</th>
                                                <th className="p-3 font-semibold text-slate-700 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            <tr>
                                                <td className="p-3 text-slate-600">Loss of Pay (Absent)</td>
                                                <td className="p-3 text-right text-slate-600">{salarySlip.absentDays} days</td>
                                                <td className="p-3 text-right text-slate-500 font-mono">₹{(salarySlip.perDaySalary || 0).toFixed(0)} × {salarySlip.absentDays || 0}</td>
                                                <td className="p-3 text-right font-medium text-red-600">- ₹{((salarySlip.perDaySalary || 0) * (salarySlip.absentDays || 0)).toFixed(2)}</td>
                                            </tr>
                                            <tr>
                                                <td className="p-3 text-slate-600">Loss of Pay (Half Days)</td>
                                                <td className="p-3 text-right text-slate-600">{salarySlip.halfDays} days</td>
                                                <td className="p-3 text-right text-slate-500 font-mono">₹{((salarySlip.perDaySalary || 0) / 2).toFixed(0)} × {salarySlip.halfDays || 0}</td>
                                                <td className="p-3 text-right font-medium text-red-600">- ₹{(((salarySlip.perDaySalary || 0) / 2) * (salarySlip.halfDays || 0)).toFixed(2)}</td>
                                            </tr>
                                            <tr>
                                                <td className="p-3 text-slate-600">Permission Deductions</td>
                                                <td className="p-3 text-right text-slate-600">{salarySlip.permissionHoursTaken} hrs</td>
                                                <td className="p-3 text-right text-slate-500 font-mono">Excess Hrs × Hourly Rate</td>
                                                <td className="p-3 text-right font-medium text-red-600">- ₹{(salarySlip.permissionDeduction || 0).toFixed(2)}</td>
                                            </tr>
                                            <tr className="bg-slate-50 font-bold">
                                                <td className="p-3 text-slate-800" colSpan={3}>Total Deductions</td>
                                                <td className="p-3 text-right text-red-700">- ₹{((salarySlip.lopAmount || 0) + (salarySlip.permissionDeduction || 0)).toFixed(2)}</td>
                                            </tr>
                                            <tr className="bg-green-50/50 border-t border-slate-200 font-bold">
                                                <td className="p-3 text-slate-800" colSpan={3}>Commissions Earned</td>
                                                <td className="p-3 text-right text-green-700">+ ₹{((salarySlip as any).totalCommissions || 0).toFixed(2)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>

                                {/* Net Salary */}
                                <div className="bg-green-50 border border-green-200 rounded-xl p-6 flex justify-between items-center">
                                    <div>
                                        <p className="text-green-800 font-semibold uppercase tracking-wider text-sm">Net Payable Salary</p>
                                        <p className="text-green-600 text-xs mt-1">Base - Deductions</p>
                                    </div>
                                    <div className="text-4xl font-extrabold text-green-700">
                                        ₹{Math.round(salarySlip.netSalary).toLocaleString()}
                                    </div>
                                </div>

                                <div className="mt-12 pt-8 border-t border-slate-200 flex justify-between text-xs text-slate-400">
                                    <div>Generated on {new Date().toLocaleDateString()}</div>
                                    <div>Authorized Signature</div>
                                </div>
                            </div>
                            {/* Monthly Commissions Section */}
                            {commissions.length > 0 && (
                                <div className="no-print no-pdf">
                                    <div className="mt-8 pt-8 border-t border-gray-200">
                                        <div className="mb-4 pb-2 border-b border-gray-100">
                                            <h3 className="text-xl font-bold text-gray-800">Monthly Commissions</h3>
                                            <p className="text-sm text-gray-500">Details of commissions earned in {salarySlip.month}</p>
                                        </div>
                                        <table className="w-full text-left text-sm border-collapse">
                                            <thead className="bg-gray-50 text-gray-600">
                                                <tr>
                                                    <th className="p-3">Date</th>
                                                    <th className="p-3">Bill ID</th>
                                                    <th className="p-3 text-right">Sale Amount (₹)</th>
                                                    <th className="p-3 text-right">Commission Earned</th>
                                                    <th className="p-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {commissions.map((comm: any, idx: number) => (
                                                    <tr key={idx}>
                                                        <td className="p-3 text-gray-700">{new Date(comm.createdAt || comm.date).toLocaleDateString('en-GB')}</td>
                                                        <td className="p-3 text-gray-600 font-mono text-xs">{comm.invoiceNumber || comm.billId || comm.id}</td>
                                                        <td className="p-3 text-right text-gray-600">₹{(comm.finalAmount || 0).toLocaleString()}</td>
                                                        <td className="p-3 text-right font-bold text-green-600">₹{(comm.staffCommissionAmount || comm.amount || 0).toLocaleString()}</td>
                                                        <td className="p-3 text-center">
                                                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${comm.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                                                                {comm.status || 'UNPAID'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                                <tr className="bg-green-50 font-bold">
                                                    <td colSpan={3} className="p-3 text-right">Total Commissions</td>
                                                    <td className="p-3 text-right text-green-700">₹{commissions.reduce((acc, c) => acc + (c.staffCommissionAmount || c.amount || 0), 0).toLocaleString()}</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-gray-400 h-64">
                            <FileText size={48} className="mb-4 opacity-20" />
                            <p>Select a staff member and month to generate a pay slip.</p>
                        </div>
                    )
                ) : (
                    // Bulk Report View
                    <div className="w-full p-4 printable-area bg-white">
                        <div className="mb-6 text-center border-b pb-4">
                            <h1 className="text-2xl font-bold uppercase">Staff Salary Summary Report</h1>
                            <p className="text-gray-600">Period: {selectedMonth}</p>
                        </div>
                        {bulkReport.length === 0 ? (
                            <div className="text-center text-gray-500 py-10">
                                {loading ? 'Generating...' : 'No report data generated yet.'}
                            </div>
                        ) : (
                            <table className="w-full text-left text-sm border-collapse border border-gray-300">
                                <thead className="bg-gray-100">
                                    <tr>
                                        <th className="border p-2">Staff ID</th>
                                        <th className="border p-2">Name</th>
                                        <th className="border p-2 text-right">Base Salary</th>
                                        <th className="border p-2 text-center">Attendance</th>
                                        <th className="border p-2 text-right">Deductions</th>
                                        <th className="border p-2 text-right bg-gray-50">Net Salary</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {bulkReport.map(slip => (
                                        <tr key={slip.staffId}>
                                            <td className="border p-2 font-mono text-gray-600">{slip.staffId}</td>
                                            <td className="border p-2 font-bold">{slip.staffName}</td>
                                            <td className="border p-2 text-right">₹{slip.baseSalary.toLocaleString()}</td>
                                            <td className="border p-2 text-center text-xs">
                                                P:{slip.presentDays} <span className="text-red-500">A:{slip.absentDays}</span> HD:{slip.halfDays}
                                            </td>
                                            <td className="border p-2 text-right text-red-600">- ₹{((slip.lopAmount || 0) + (slip.permissionDeduction || 0)).toFixed(2)}</td>
                                            <td className="border p-2 text-right font-bold bg-green-50">₹{Math.round(slip.netSalary || 0).toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    <tr className="bg-gray-800 text-white font-bold">
                                        <td colSpan={2} className="border p-2 text-right">Total Payout:</td>
                                        <td colSpan={5} className="border p-2 text-right">
                                            ₹{bulkReport.reduce((acc, curr) => acc + Math.round(curr.netSalary), 0).toLocaleString()}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StaffSalaryView;
