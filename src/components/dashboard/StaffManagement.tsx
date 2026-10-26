import React, { useState, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
    Plus, Search, Trash2, Edit2, User, Phone, Calendar as CalendarIcon,
    CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, Loader2,
    FileText, UploadCloud, DollarSign, Timer, Users, Briefcase, CreditCard, Shield, Activity,
    UserCheck, Save, Edit3, Key, Lock, Mail
} from 'lucide-react';
import { staffApi, Staff, Attendance, Role, Commission, billingApi } from '@/lib/api';
import {
    format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
    addMonths, subMonths, getDay, isToday, startOfWeek, endOfWeek, isSameMonth
} from 'date-fns';
import { useGlobalData } from '@/context/GlobalDataContext';
import { useCachedResource } from '@/hooks/useCachedResource';
import { SyncIndicator } from '@/components/SyncIndicator';
import StaffSalaryView from './StaffSalaryView';
import ConfirmPaymentModal from './ConfirmPaymentModal';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createStaffAuthAccount } from '@/lib/authHelper';
import { useConfirm } from '@/hooks/useConfirm';

const StaffManagement = () => {
    const [activeTab, setActiveTab] = useState<'directory' | 'salary'>('directory');
    const { staff: staffList, loading: staffLoading, refreshStaff, isSyncing } = useGlobalData();
    const [searchTerm, setSearchTerm] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const { confirm: confirmAction, ConfirmationDialog } = useConfirm();

    const handleDelete = (id: string) => {
        confirmAction("Are you sure you want to delete this staff member?", async () => {
            setDeletingId(id);
            try {
                await staffApi.delete(id);
                toast.success("Staff deleted successfully");
                refreshStaff();
            } catch (error) {
                toast.error("Failed to delete staff");
            } finally {
                setDeletingId(null);
            }
        });
    };

    return (
        <div className="p-6 h-full bg-slate-50 flex flex-col max-h-screen overflow-hidden">
            <ConfirmationDialog />
            {/* Header */}
            <div className="flex justify-between items-center mb-6 flex-shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                        <Users className="text-blue-600" />
                        Staff Management
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">Manage employees, track attendance, and process payroll</p>
                </div>

                <div className="flex items-center gap-4">
                    <SyncIndicator isSyncing={isSyncing} />
                    <div className="flex space-x-1 bg-white p-1.5 rounded-xl shadow-sm border border-gray-200">
                        <TabButton active={activeTab === 'directory'} onClick={() => setActiveTab('directory')} icon={Briefcase} label="Directory" />
                        <TabButton active={activeTab === 'salary'} onClick={() => setActiveTab('salary')} icon={DollarSign} label="Payroll" />
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-auto bg-white rounded-2xl shadow-sm border border-gray-200 p-6 relative">
                {activeTab === 'directory' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full flex flex-col">
                        <DirectoryView
                            staff={staffList}
                            loading={staffLoading}
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            onRefresh={refreshStaff}
                            onDelete={handleDelete}
                            deletingId={deletingId}
                            confirmAction={confirmAction}
                        />
                    </div>
                )}
                {activeTab === 'salary' && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 h-full">
                        <StaffSalaryView />
                    </div>
                )}

            </div>
        </div>
    );
};

const TabButton = ({ active, onClick, icon: Icon, label }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center space-x-2 px-3 py-1.5 text-sm rounded-lg text-sm font-semibold transition-all ${active
            ? 'bg-blue-600 text-white shadow-md transform scale-105'
            : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
    >
        <Icon size={16} />
        <span>{label}</span>
    </button>
);

// --- MARK ATTENDANCE MODAL ---
const MarkAttendanceDialog = ({ staff, date, currentStatus, onClose, onSuccess }: any) => {
    const [status, setStatus] = useState(currentStatus || 'PRESENT');
    const [remarks, setRemarks] = useState('');

    // Permission Time State
    const [startTime, setStartTime] = useState("10:00");
    const [endTime, setEndTime] = useState("12:00");
    const [permHrs, setPermHrs] = useState(0);

    useEffect(() => {
        if (startTime && endTime) {
            const [h1, m1] = startTime.split(':').map(Number);
            const [h2, m2] = endTime.split(':').map(Number);
            const totalStartMinutes = h1 * 60 + m1;
            const totalEndMinutes = h2 * 60 + m2;
            const diffInMinutes = totalEndMinutes - totalStartMinutes;
            if (diffInMinutes > 0) {
                const h = Math.floor(diffInMinutes / 60);
                const m = diffInMinutes % 60;
                setPermHrs(Number(`${h}.${m.toString().padStart(2, '0')}`));
            } else {
                setPermHrs(0);
            }
        }
    }, [startTime, endTime]);

    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        setLoading(true);
        try {
            const payload: any = {
                staffId: staff.id,
                staffName: staff.name,
                date: date,
                status: status,
                remarks: remarks,
                permissionTimeRange: status === 'PERMISSION' ? `${startTime} - ${endTime}` : undefined,
                permissionHours: status === 'PERMISSION' ? permHrs : 0,
                inTime: status === 'PRESENT' ? new Date().toLocaleTimeString('en-US', { hour12: false }) : "-",
                outTime: "-"
            };
            await staffApi.markAttendance(payload);
            toast.success("Attendance marked");
            onSuccess();
            onClose();
        } catch (e) {
            toast.error("Failed to mark attendance");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <UserCheck size={24} />
                        Mark Attendance
                    </h3>
                    <p className="text-blue-100 text-sm opacity-90">{staff.name}</p>
                </div>

                <div className="p-6 space-y-5">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                            <Activity size={12} /> Status
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {['PRESENT', 'ABSENT', 'HALF_DAY', 'PERMISSION', 'LEAVE', 'SICK_LEAVE'].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setStatus(s)}
                                    className={`py-2.5 px-3 rounded-xl border text-sm font-bold transition-all ${status === s
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200 scale-[1.02]'
                                        : 'bg-gray-50 border-gray-100 text-gray-600 hover:bg-white hover:border-blue-200'}`}
                                >
                                    {s.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    </div>

                    {status === 'PERMISSION' && (
                        <div className="space-y-4 animate-in slide-in-from-top-4 duration-500 fill-mode-both">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-wider">Start Time</label>
                                    <TimePicker value={startTime} onChange={setStartTime} />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-gray-400 uppercase tracking-wider">End Time</label>
                                    <TimePicker value={endTime} onChange={setEndTime} />
                                </div>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-xl text-center border border-blue-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-1 opacity-10 group-hover:scale-110 transition-transform">
                                    <Clock size={48} />
                                </div>
                                <div className="text-xs text-blue-600 font-black uppercase tracking-widest mb-1">Total Duration</div>
                                <div className="text-3xl font-black text-blue-800 tabular-nums">{String(permHrs)} <span className="text-base opacity-60">hrs</span></div>
                            </div>
                        </div>
                    )}



                    <div className="flex gap-3 pt-2">
                        <button onClick={onClose} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-50 rounded-xl transition-colors border border-transparent hover:border-gray-100">Cancel</button>
                        <button
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-black hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 shadow-lg shadow-blue-100 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {loading ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- DIRECTORY VIEW (Split Pane Layout) ---
const DirectoryView = ({ staff, loading, searchTerm, setSearchTerm, onRefresh, onDelete, deletingId, confirmAction }: any) => {
    const [showModal, setShowModal] = useState(false);
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
    const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
    const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // Payment Modal State
    const [paymentModalReq, setPaymentModalReq] = useState<{ isOpen: boolean; commission: any | null }>({ isOpen: false, commission: null });

    // Manual marking state
    const [markingStaff, setMarkingStaff] = useState<Staff | null>(null);
    const [markingStatus, setMarkingStatus] = useState<string>('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // --- ATTENDANCE LOGIC (Global for List Status) ---
    const { data: attendanceData, refresh: refreshAttendance } = useCachedResource<any[]>(
        `daily_attendance_${date}`,
        async () => {
            const res = await staffApi.getDailyAttendance(date);
            const data = res.data;
            let list: any[] = [];
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                list = Object.entries(data).map(([staffId, details]: any) => ({
                    staffId, staffName: details.name, date,
                    status: details.status || details.type,
                    remarks: details.remarks,
                    permissionTimeRange: details.permissionTimeRange || details.permissionTime
                }));
            } else if (Array.isArray(data)) {
                list = data.map((item: any) => ({
                    ...item,
                    status: item.status || item.type,
                    permissionTimeRange: item.permissionTimeRange || item.permissionTime
                }));
            }
            return list;
        },
        { ttl: 0 } // No cache for live actions
    );

    const attendanceMap = useMemo(() => {
        const map: Record<string, any> = {};
        if (Array.isArray(attendanceData)) {
            attendanceData.forEach(a => map[a.staffId] = a);
        }
        return map;
    }, [attendanceData]);

    const handleMarkClick = (staffObj: Staff, status: string) => {
        // Quick mark for PRESENT, ABSENT, and HALF_DAY
        if (status === 'PRESENT' || status === 'ABSENT' || status === 'HALF_DAY') {
            const payload: any = {
                staffId: staffObj.id,
                staffName: staffObj.name,
                date: date,
                status: status,
                inTime: status === 'PRESENT' ? new Date().toLocaleTimeString('en-US', { hour12: false }) : "-",
                outTime: "-"
            };
            staffApi.markAttendance(payload).then(() => {
                toast.success(`Marked ${status}`);
                refreshAttendance();
                // Refresh specific staff history if selected
                if (selectedStaff?.id === staffObj.id) {
                    refreshHistory();
                }
            }).catch(() => toast.error('Failed'));
        } else {
            setMarkingStaff(staffObj);
            setMarkingStatus(status);
        }
    };

    // --- SELECTED STAFF HISTORY & INCENTIVE ---
    const [history, setHistory] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [incentive, setIncentive] = useState(0);
    const [pendingTotal, setPendingTotal] = useState(0);
    const [commissions, setCommissions] = useState<Commission[]>([]);
    const [commissionsLoading, setCommissionsLoading] = useState(false);


    const fetchHistory = async (id: string) => {
        setHistoryLoading(true);
        try {
            const currentMonth = format(new Date(), 'yyyy-MM');

            // 1. Fetch Attendance History
            const res = await staffApi.getStaffMonthAttendance(id, currentMonth);
            const data = res.data;
            let list: any[] = [];
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                list = Object.entries(data).map(([key, val]: any) => ({
                    ...val,
                    date: `${currentMonth}-${key.padStart(2, '0')}`,
                    status: val.status || val.type
                }));
            } else if (Array.isArray(data)) {
                list = data;
            }
            list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            setHistory(list);

            /* // 2. Fetch Incentive - MOVED TO fetchCommissions to ensure consistency with ledger
            try {
                const slipRes = await staffApi.getSalarySlip(id, currentMonth);
                setIncentive(slipRes.data?.commissionEarnings || 0);
            } catch (err) {
                setIncentive(0);
            } */
            // Reset to 0 initially, will be set by fetchCommissions
            setIncentive(0);
            setPendingTotal(0);

        } catch (e) {
            console.error("Failed to load history", e);
        } finally {
            setHistoryLoading(false);
        }
    };

    const refreshHistory = () => {
        if (selectedStaff) {
            fetchHistory(selectedStaff.id);
            fetchCommissions(selectedStaff.id, selectedStaff.name);
        }
    };

    const handleStatusToggle = async (comm: any) => {
        if (!comm || !comm.id) return;
        const newStatus = comm.status === 'PAID' ? 'UNPAID' : 'PAID';

        if (newStatus === 'PAID') {
            setPaymentModalReq({ isOpen: true, commission: comm });
            return;
        }

        confirmAction(`Mark ${comm.billId || 'commission'} as ${newStatus}?`, async () => {
            try {
                // Logic for reverting to UNPAID
                if (comm.source === 'BILL') {
                    // Update the Bill directly for legacy/bill-embedded support
                    await billingApi.update(comm.id, { staffCommissionStatus: newStatus } as any);
                } else {
                    // If there's no endpoint to unpay, warn the user
                    toast.error("Cannot revert this commission to UNPAID via this interface.");
                    return;
                }

                toast.success(`Marked as ${newStatus}`);
                // Refresh
                if (selectedStaff) fetchCommissions(selectedStaff.id, selectedStaff.name);
            } catch (err) {
                console.error("Failed to update status", err);
                toast.error("Failed to update status. " + (err instanceof Error ? err.message : ""));
            }
        });
    };

    const handlePaymentConfirm = async (paymentMethod: string) => {
        const comm = paymentModalReq.commission;
        if (!comm || !comm.id) return;
        try {
            await staffApi.payCommission(comm.id, paymentMethod);
            toast.success(`Marked as PAID via ${paymentMethod}`);
            if (selectedStaff) fetchCommissions(selectedStaff.id, selectedStaff.name);
            setPaymentModalReq({ isOpen: false, commission: null });
        } catch (err) {
            console.error("Failed to mark as paid", err);
            toast.error("Failed to mark as paid.");
        }
    };

    const fetchCommissions = async (id: string, name?: string) => {
        setCommissionsLoading(true);
        try {
            // Use current month by default or add a month selector if needed.
            // For now, defaulting to current month as per usual "Ledger" view for a specific period
            // OR if the user intends "Ledger" to be all-time, we might need a different approach,
            // but the request specifically asked for `?yearMonth=2026-01`.
            // Let's use the current month since the UI shows "This Month" incentives.
            const currentYearMonth = format(new Date(), 'yyyy-MM');

            const commRes = await staffApi.getStaffCommissions(id, currentYearMonth);
            // The backend returns List<Map<String, Object>>, which matches our Commission interface roughly
            // but might need mapping if keys differ. Assuming standard keys as per typical Spring Boot -> JSON.

            const fetchedCommissions = Array.isArray(commRes.data) ? commRes.data : [];

            // Sort by date desc
            fetchedCommissions.sort((a: any, b: any) => {
                const dA = a.date ? new Date(a.date).getTime() : 0;
                const dB = b.date ? new Date(b.date).getTime() : 0;
                return dB - dA;
            });

            setCommissions(fetchedCommissions as any[]);

            // Calculate Incentive for Current Month (which IS the returned data now)
            const monthlyTotal = fetchedCommissions
                .reduce((sum: number, c: any) => {
                    // Backend likely returns 'amount' or 'staffCommissionAmount'
                    const val = Number(c.amount) || Number(c.staffCommissionAmount) || 0;
                    return sum + val;
                }, 0);

            setIncentive(monthlyTotal);

            // Calculate Pending Total (All Time Unpaid)
            const pending = fetchedCommissions
                .filter((c: any) => c.status === 'UNPAID')
                .reduce((sum: number, c: any) => {
                    const val = Number(c.amount) || Number(c.staffCommissionAmount) || 0;
                    return sum + val;
                }, 0);
            setPendingTotal(pending);

        } catch (error) {
            console.error("Failed to fetch commissions", error);
            setCommissions([]);
            setIncentive(0);
            setPendingTotal(0);
        } finally {
            setCommissionsLoading(false);
        }
    };

    useEffect(() => {
        if (selectedStaff) {
            fetchHistory(selectedStaff.id);
            fetchCommissions(selectedStaff.id, selectedStaff.name);
        } else {
            setHistory([]);
            setCommissions([]);
        }
    }, [selectedStaff]);

    const filteredCommissions = commissions.filter(c => {
        if (!c.date) return true;
        const commDate = new Date(c.date);
        if (startDate) {
            const start = new Date(startDate);
            start.setHours(0, 0, 0, 0);
            if (commDate < start) return false;
        }
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (commDate > end) return false;
        }
        return true;
    });


    // --- FILTERING ---
    const filteredStaff = staff.filter((s: Staff) =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone.includes(searchTerm)
    );

    // Derived Stats
    const getStats = () => {
        const present = history.filter(h => h.status === 'PRESENT' || h.status === 'FULL_DAY').length;
        const absent = history.filter(h => h.status === 'ABSENT').length;
        const perms = history.filter(h => h.status === 'PERMISSION').length;
        return { present, absent, perms };
    };
    const stats = getStats();

    return (
        <div className="flex h-full gap-6">
            <ConfirmPaymentModal
                isOpen={paymentModalReq.isOpen}
                onClose={() => setPaymentModalReq({ isOpen: false, commission: null })}
                onConfirm={handlePaymentConfirm}
                message={`Mark ${paymentModalReq.commission?.billId || 'commission'} as PAID?`}
            />
            {/* Left Panel: List */}
            <div className="w-1/3 bg-white rounded-xl shadow-sm flex flex-col border border-gray-200 overflow-hidden">
                <div className="p-4 border-b bg-gray-50">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-base font-bold text-gray-800 flex items-center gap-2">
                            <Users className="text-blue-600" size={20} /> Staff Directory
                        </h2>
                        <button
                            onClick={() => { setEditingStaff(null); setShowModal(true); }}
                            className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 shadow-sm transition-colors"
                            title="Add Staff"
                        >
                            <Plus size={20} />
                        </button>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Search staff..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 border rounded-lg w-full focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                        />
                    </div>
                </div>

                <div className="overflow-y-auto flex-grow custom-scrollbar">
                    {loading && staff.length === 0 ? (
                        <div className="p-8 text-center text-gray-500"><Loader2 className="animate-spin mx-auto mb-2" /> Loading...</div>
                    ) : filteredStaff.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">No staff found.</div>
                    ) : (
                        filteredStaff.map(s => {
                            const record = attendanceMap[s.id];
                            const statusColor = record?.status === 'PRESENT' ? 'bg-green-500' :
                                record?.status === 'ABSENT' ? 'bg-red-500' :
                                    record?.status === 'permission' || record?.status === 'PERMISSION' ? 'bg-blue-500' : 'bg-gray-300';
                            return (
                                <div
                                    key={s.id}
                                    onClick={() => setSelectedStaff(s)}
                                    className={`p-4 border-b cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-3 relative ${selectedStaff?.id === s.id ? 'bg-blue-50 border-blue-200' : ''}`}
                                >
                                    <div className="relative shrink-0">
                                        {s.profilePicUrl ? (
                                            <img src={s.profilePicUrl} alt={s.name} className="w-10 h-10 rounded-full object-cover border border-gray-200" />
                                        ) : (
                                            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-blue-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                                                {s.name.charAt(0)}
                                            </div>
                                        )}
                                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${statusColor}`}></div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="font-semibold text-gray-900 truncate">{s.name}</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-2">
                                            <span className="flex items-center gap-1"><Briefcase size={10} /> {s.role}</span>
                                            {s.hasLoginAccount && (
                                                <span className="text-emerald-600 font-medium flex items-center gap-0.5" title="ERP Login Active">
                                                    <Key size={10} /> Active
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {selectedStaff?.id === s.id && <ChevronRight size={16} className="text-blue-400" />}
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Right Panel: Details */}
            <div className="w-2/3 flex flex-col gap-6 overflow-y-auto custom-scrollbar h-full">
                {selectedStaff ? (
                    <>
                        {/* Header & Details Card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 shrink-0">
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-4">
                                    {selectedStaff.profilePicUrl ? (
                                        <img src={selectedStaff.profilePicUrl} alt={selectedStaff.name} className="w-16 h-16 rounded-full object-cover border-4 border-gray-50 shadow-sm" />
                                    ) : (
                                        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-2xl shadow-sm">
                                            {selectedStaff.name.charAt(0)}
                                        </div>
                                    )}
                                    <div>
                                        <h1 className="text-2xl font-bold text-gray-900">{selectedStaff.name}</h1>
                                        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500 mt-1">
                                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold uppercase">{selectedStaff.role}</span>
                                            {selectedStaff.hasLoginAccount && (
                                                <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1">
                                                    <Key size={10} /> ERP Login
                                                </span>
                                            )}
                                            {selectedStaff.email && (
                                                <span className="text-xs text-gray-500 font-mono">({selectedStaff.email})</span>
                                            )}
                                            <span>•</span>
                                            <span>ID: {selectedStaff.id.substring(0, 6)}</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => { setEditingStaff(selectedStaff); setShowModal(true); }} className="p-2 text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors" title="Edit">
                                        <Edit2 size={20} />
                                    </button>
                                    <button onClick={() => onDelete(selectedStaff.id)} className="p-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors" title="Delete">
                                        {deletingId === selectedStaff.id ? <Loader2 size={20} className="animate-spin" /> : <Trash2 size={20} />}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100">
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-green-50 text-green-600 rounded-lg"><Phone size={18} /></div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase">Contact</div>
                                        <div className="text-sm font-semibold text-gray-800">{selectedStaff.phone}</div>
                                        {selectedStaff.emergencyPhone && <div className="text-xs text-red-500 mt-0.5 font-medium">Emerg: {selectedStaff.emergencyPhone}</div>}
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-purple-50 text-purple-600 rounded-lg"><CreditCard size={18} /></div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase">Bank Details</div>
                                        <div className="text-xs text-gray-500">Acc: <span className="font-mono font-semibold text-gray-800">{selectedStaff.accountNumber || "N/A"}</span></div>
                                        <div className="text-xs text-gray-500">IFSC: <span className="font-mono font-semibold text-gray-800">{selectedStaff.ifscCode || "N/A"}</span></div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-orange-50 text-orange-600 rounded-lg"><DollarSign size={18} /></div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase">Salary</div>
                                        <div className="text-sm font-semibold text-gray-800">₹{selectedStaff.baseSalary?.toLocaleString() || 0}</div>
                                        <div className="text-xs text-gray-500">Permit: {selectedStaff.allowedPermHours || 0} hrs/mo</div>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="p-2 bg-yellow-50 text-yellow-600 rounded-lg"><Activity size={18} /></div>
                                    <div>
                                        <div className="text-xs font-bold text-gray-400 uppercase">Incentives</div>
                                        <div className="text-sm font-bold text-green-600">₹{incentive.toLocaleString()}</div>
                                        <div className="text-xs text-gray-400">This Month</div>
                                    </div>
                                </div>

                            </div>
                        </div>

                        {/* Today's Action & Stats */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                            {/* Today's Action Card */}
                            <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        <CheckingIcon /> Attendance
                                    </h3>
                                    <input
                                        type="date"
                                        value={date}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 text-sm font-medium text-gray-700 outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="flex gap-2">
                                    {[
                                        { type: 'PRESENT', label: 'Present', color: 'bg-green-100 text-green-700 hover:bg-green-200 border-green-200' },
                                        { type: 'ABSENT', label: 'Absent', color: 'bg-red-100 text-red-700 hover:bg-red-200 border-red-200' },
                                        { type: 'HALF_DAY', label: 'Half Day', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200' },
                                        { type: 'PERMISSION', label: 'Permit', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200' },
                                    ].map(opt => {
                                        const record = attendanceMap[selectedStaff.id];
                                        const isActive = record?.status === opt.type || (opt.type === 'PRESENT' && record?.status === 'FULL_DAY');
                                        return (
                                            <button
                                                key={opt.type}
                                                onClick={() => handleMarkClick(selectedStaff, opt.type)}
                                                className={`flex-1 py-3 rounded-xl font-bold text-sm border transition-all ${isActive ? 'ring-2 ring-offset-1 ring-blue-500 shadow-md transform scale-[1.02]' : ''} ${opt.color}`}
                                            >
                                                {opt.label}
                                            </button>
                                        );
                                    })}
                                </div>
                                {attendanceMap[selectedStaff.id] && (
                                    <div className="mt-3 text-xs text-center text-gray-500 bg-gray-50 py-1 rounded border border-gray-100">
                                        Current Status: <span className="font-bold text-gray-800">{attendanceMap[selectedStaff.id].status}</span>
                                        {attendanceMap[selectedStaff.id].inTime && <span className="ml-2">In: {attendanceMap[selectedStaff.id].inTime}</span>}
                                    </div>
                                )}
                            </div>

                            {/* Stats Card */}
                            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl shadow-lg p-5 text-white flex flex-col justify-between relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-10"><Activity size={60} /></div>
                                <div>
                                    <h4 className="text-blue-100 text-xs font-bold uppercase tracking-wider mb-1">{format(new Date(), 'MMMM')} Summary</h4>
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <div className="text-3xl font-bold">{stats.present}</div>
                                            <div className="text-blue-200 text-xs">Present</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xl font-bold text-red-200">{stats.absent}</div>
                                            <div className="text-blue-200 text-xs">Absent</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xl font-bold text-orange-200">{stats.perms}</div>
                                            <div className="text-blue-200 text-xs">Permits</div>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setShowCalendarModal(true); }}
                                    className="mt-4 w-full py-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                                >
                                    <CalendarIcon size={14} /> View Full Calendar
                                </button>
                            </div>
                        </div>

                        {/* Commission Ledger View */}
                        <div className="flex flex-col gap-4 w-full">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-4 shrink-0">
                                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-orange-500 flex justify-between items-center">
                                    <div>
                                        <div className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Pending Payout</div>
                                        <div className="text-2xl font-bold text-orange-600 mt-1">₹{filteredCommissions.filter(c => c.status === 'UNPAID').reduce((sum, c) => sum + (Number(c.amount) || 0), 0).toLocaleString()}</div>
                                    </div>
                                    <div className="p-3 bg-orange-50 rounded-full text-orange-500">
                                        <Clock size={24} />
                                    </div>
                                </div>
                                <div className="bg-white p-5 rounded-xl shadow-sm border-l-4 border-green-500 flex justify-between items-center">
                                    <div>
                                        <div className="text-gray-500 text-xs font-bold uppercase tracking-wider">Total Paid Payout</div>
                                        <div className="text-2xl font-bold text-green-600 mt-1">₹{filteredCommissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + (Number(c.amount) || 0), 0).toLocaleString()}</div>
                                    </div>
                                    <div className="p-3 bg-green-50 rounded-full text-green-500">
                                        <CheckCircle size={24} />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col min-h-[500px]">
                                <div className="border-b bg-gray-50 px-3 py-1.5 text-sm border-gray-200 flex justify-between items-center gap-4">
                                    <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2 whitespace-nowrap">
                                        <CreditCard size={16} className="text-blue-600" /> Commission Ledger
                                    </h3>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="flex items-center gap-1 border rounded-lg bg-white px-2 py-1">
                                            <input
                                                type="date"
                                                value={startDate}
                                                onChange={(e) => setStartDate(e.target.value)}
                                                className="text-xs outline-none bg-transparent"
                                            />
                                            <span className="text-gray-400 text-xs whitespace-nowrap">to</span>
                                            <input
                                                type="date"
                                                value={endDate}
                                                onChange={(e) => setEndDate(e.target.value)}
                                                className="text-xs outline-none bg-transparent"
                                            />
                                        </div>
                                        {(startDate || endDate) && (
                                            <button
                                                onClick={() => { setStartDate(''); setEndDate(''); }}
                                                className="text-xs text-red-500 hover:text-red-700 font-medium px-1"
                                            >
                                                Clear
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="w-full">
                                    <table className="w-full text-left border-collapse">
                                        <thead className="bg-gray-50 sticky top-0 z-10">
                                            <tr>
                                                <th className="p-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Date</th>
                                                <th className="p-4 font-semibold text-gray-600 text-xs uppercase tracking-wider">Bill ID</th>
                                                <th className="p-4 font-semibold text-gray-600 text-xs uppercase tracking-wider text-right">Amount</th>
                                                <th className="p-4 font-semibold text-gray-600 text-xs uppercase tracking-wider text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {commissionsLoading ? (
                                                <tr><td colSpan={4} className="p-8 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></td></tr>
                                            ) : filteredCommissions.length === 0 ? (
                                                <tr><td colSpan={4} className="p-8 text-center text-gray-400">No commission history found.</td></tr>
                                            ) : (
                                                filteredCommissions.map((comm) => (
                                                    <tr key={comm.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="p-4 text-sm font-medium text-gray-900">
                                                            {new Date(comm.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            <div className="text-xs text-gray-400">{new Date(comm.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                                                        </td>
                                                        <td className="p-4 text-sm font-mono text-blue-600">{comm.billId}</td>
                                                        <td className="p-4 text-sm font-bold text-right">₹{(Number(comm.amount) || 0).toFixed(2)}</td>
                                                        <td className="p-4 text-center">
                                                            <button
                                                                onClick={() => handleStatusToggle(comm)}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-transform active:scale-95 ${comm.status === 'PAID' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                                                    }`}
                                                                title="Click to toggle status"
                                                            >
                                                                {comm.status === 'PAID' ? <CheckCircle size={12} /> : <Clock size={12} />}
                                                                {comm.status}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                        {/* Footer Summaries */}
                                        {!commissionsLoading && filteredCommissions.length > 0 && (
                                            <tfoot className="bg-gray-50 font-bold text-sm">
                                                <tr>
                                                    <td colSpan={2} className="p-4 text-right">Total Pending:</td>
                                                    <td className="p-4 text-right text-orange-600">
                                                        ₹{(filteredCommissions.filter(c => c.status === 'UNPAID').reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0).toFixed(2)}
                                                    </td>
                                                    <td className="p-4"></td>
                                                </tr>
                                                <tr>
                                                    <td colSpan={2} className="p-4 text-right border-t border-gray-200">Total Paid:</td>
                                                    <td className="p-4 text-right text-green-600 border-t border-gray-200">
                                                        ₹{(filteredCommissions.filter(c => c.status === 'PAID').reduce((sum, c) => sum + (Number(c.amount) || 0), 0) || 0).toFixed(2)}
                                                    </td>
                                                    <td className="p-4 border-t border-gray-200"></td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            </div>

                        </div>
                    </>
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Users size={40} className="text-gray-300" />
                        </div>
                        <h3 className="text-base font-medium text-gray-600">No Staff Selected</h3>
                        <p className="text-gray-400 max-w-xs text-center mt-2">Select a staff member from the directory to view details, manage attendance, and see history.</p>
                    </div>
                )}
            </div>

            {markingStaff && (
                <MarkAttendanceDialog
                    staff={markingStaff}
                    date={date}
                    currentStatus={markingStatus}
                    onClose={() => setMarkingStaff(null)}
                    onSuccess={() => { setMarkingStaff(null); refreshAttendance(); refreshHistory(); }}
                />
            )}

            {showModal && (
                <StaffFormModal
                    staff={editingStaff}
                    onClose={() => setShowModal(false)}
                    onSuccess={() => { setShowModal(false); onRefresh(); }}
                />
            )}

            {showCalendarModal && selectedStaff && (
                <StaffCalendarModal
                    staff={selectedStaff}
                    onClose={() => setShowCalendarModal(false)}
                />
            )}
        </div>
    );
};

const CheckingIcon = () => <Clock size={20} className="text-gray-500" />;

// --- CALENDAR MODAL (Fullscreen & Compact No-Scroll) ---
const StaffCalendarModal = ({ staff, onClose }: { staff: Staff, onClose: () => void }) => {
    const [currentDate, setCurrentDate] = useState(new Date());

    const calendarDays = useMemo(() => {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        const startDate = startOfWeek(monthStart);
        const endDate = endOfWeek(monthEnd);
        return eachDayOfInterval({ start: startDate, end: endDate });
    }, [currentDate]);

    const year = format(currentDate, 'yyyy');
    const month = format(currentDate, 'MM');

    // Calculate grid rows dynamically for equal height
    // Typically 5 or 6 rows
    const weekCount = Math.ceil(calendarDays.length / 7);

    // States for editing
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [remarksInput, setRemarksInput] = useState("");
    const [statusInput, setStatusInput] = useState<string>("PRESENT");

    // Calendar Permission State
    const [permStartTime, setPermStartTime] = useState("10:00");
    const [permEndTime, setPermEndTime] = useState("12:00");
    const [calPermHrs, setCalPermHrs] = useState(0);

    useEffect(() => {
        if (permStartTime && permEndTime) {
            const [h1, m1] = permStartTime.split(':').map(Number);
            const [h2, m2] = permEndTime.split(':').map(Number);
            const totalStartMinutes = h1 * 60 + m1;
            const totalEndMinutes = h2 * 60 + m2;
            const diffInMinutes = totalEndMinutes - totalStartMinutes;
            if (diffInMinutes > 0) {
                const h = Math.floor(diffInMinutes / 60);
                const m = diffInMinutes % 60;
                setCalPermHrs(Number(`${h}.${m.toString().padStart(2, '0')}`));
            } else {
                setCalPermHrs(0);
            }
        }
    }, [permStartTime, permEndTime]);

    const { data: monthData, refresh: refreshMonthData } = useCachedResource<any[]>(
        `month_attendance_${year}_${month}_${staff.id}`,
        async () => {
            // Backend returns list of daily records
            const res = await staffApi.getStaffMonthAttendance(staff.id, `${year}-${month}`);
            const data = res.data;
            if (data && typeof data === 'object' && !Array.isArray(data)) {
                return Object.entries(data).map(([key, val]: any) => ({ ...val, date: `${year}-${month}-${key.padStart(2, '0')}` }));
            }
            return Array.isArray(data) ? data : [];
        },
        { ttl: 0 }
    );

    const dataMap = useMemo(() => {
        const map: Record<string, any> = {};
        if (monthData) {
            monthData.forEach((r: any) => {
                let dKey = r.date;
                if (!dKey && r.day) dKey = `${year}-${month}-${r.day.toString().padStart(2, '0')}`;

                // Prioritize status from various fields
                const st = r.status || r.type || r.data?.status;
                const remarks = r.remarks || r.data?.remarks || r.comment || r.notes;
                const permissionTimeRange = r.permissionTimeRange || r.permissionTime || r.data?.permissionTimeRange;

                if (dKey) {
                    map[dKey] = { ...r, status: st, remarks, permissionTimeRange };
                }
            });
        }
        return map;
    }, [monthData, year, month]);

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'PRESENT': case 'FULL_DAY': return 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100';
            case 'ABSENT': return 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100';
            case 'HALF_DAY': return 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100';
            case 'LEAVE': case 'SICK_LEAVE': return 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100';
            case 'PERMISSION': return 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100';
            default: return 'bg-white border-gray-100 text-gray-400 hover:bg-gray-50';
        }
    };

    const handleDayClick = (dateStr: string, currentData?: any) => {
        if (!dateStr) return;
        setSelectedDate(dateStr);
        setStatusInput(currentData?.status || "PRESENT");
        setRemarksInput(currentData?.remarks || "");

        // Parse existing time range if available
        if (currentData?.permissionTimeRange && currentData.permissionTimeRange.includes('-')) {
            const [s, e] = currentData.permissionTimeRange.split('-').map((t: string) => t.trim());
            setPermStartTime(s || "10:00");
            setPermEndTime(e || "12:00");
        } else {
            setPermStartTime("10:00");
            setPermEndTime("12:00");
        }
    };

    const [saving, setSaving] = useState(false);

    const handleSaveDay = async () => {
        if (!selectedDate) return;
        setSaving(true);
        try {
            const payload: any = {
                staffId: staff.id,
                staffName: staff.name,
                date: selectedDate,
                status: statusInput as any,
                remarks: remarksInput,
                permissionTimeRange: statusInput === 'PERMISSION' ? `${permStartTime} - ${permEndTime}` : undefined,
                permissionHours: statusInput === 'PERMISSION' ? calPermHrs : 0,
                inTime: statusInput === 'PRESENT' ? "09:00" : "-",
                outTime: "-"
            };
            await staffApi.markAttendance(payload);
            toast.success("Updated!");
            setSelectedDate(null);
            refreshMonthData();
        } catch (e) { toast.error("Failed to update"); }
        finally { setSaving(false); }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in zoom-in-95">
            {/* Fullscreen-ish Modal */}
            <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-7xl h-[92vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold border border-blue-200 text-xl">
                            {staff.name.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-800">{staff.name}</h2>
                            <p className="text-sm text-gray-500 font-medium">{staff.role} • Attendance History</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        {/* Month Navigation */}
                        <div className="flex items-center gap-4 bg-white px-3 py-1.5 text-sm rounded-xl shadow-sm border border-gray-200">
                            <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><ChevronLeft size={20} /></button>
                            <span className="text-base font-bold text-gray-800 min-w-[140px] text-center">{format(currentDate, 'MMMM yyyy')}</span>
                            <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><ChevronRight size={20} /></button>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-red-100 hover:text-red-600 rounded-full text-gray-400 transition-colors"><XCircle size={32} /></button>
                    </div>
                </div>

                {/* Calendar Grid Container */}
                <div className="flex-1 flex flex-col p-4 bg-slate-50 overflow-y-auto">
                    {/* Weekday Headers */}
                    <div className="grid grid-cols-7 gap-2 mb-2 shrink-0">
                        {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                            <div key={d} className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest">{d}</div>
                        ))}
                    </div>

                    {/* Days Grid - Flex-1 to fill remaining space */}
                    <div className="flex-1 grid grid-cols-7 gap-2 min-h-0">
                        {calendarDays.map((d) => {
                            const dateKey = format(d, 'yyyy-MM-dd');
                            const dayData = dataMap[dateKey];
                            const status = dayData?.status;
                            const isCurrentMonth = isSameMonth(d, currentDate);
                            const isTodayDate = isToday(d);

                            return (
                                <div
                                    key={dateKey}
                                    onClick={() => handleDayClick(dateKey, dayData)}
                                    className={`
                                        rounded-xl border flex flex-col p-2 relative transition-all duration-200 cursor-pointer hover:shadow-md min-h-[100px]
                                        ${!isCurrentMonth ? 'opacity-30 grayscale bg-gray-50/50' : ''}
                                        ${getStatusColor(status)}
                                        ${isTodayDate ? 'ring-2 ring-blue-500 ring-offset-2 z-10 shadow-lg' : 'shadow-sm'}
                                    `}
                                >
                                    <div className="flex justify-between items-start">
                                        <span className={`text-base font-bold ${!status && isCurrentMonth ? 'text-gray-700' : 'opacity-80'}`}>{format(d, 'd')}</span>
                                        {status && (
                                            <div title={status}>
                                                {status === 'PRESENT' && <CheckCircle size={16} />}
                                                {status === 'ABSENT' && <XCircle size={16} />}
                                                {status === 'HALF_DAY' && <Clock size={16} />}
                                                {status === 'PERMISSION' && <User size={16} />}
                                            </div>
                                        )}
                                    </div>

                                    {dayData?.remarks && (
                                        <div className="mt-1 w-full px-0.5 z-20 relative">
                                            <div className="text-xs font-bold text-gray-900 bg-yellow-50 border border-yellow-200 rounded px-1.5 py-1 break-words text-center shadow-sm" title={dayData.remarks}>
                                                {dayData.remarks}
                                            </div>
                                        </div>
                                    )}

                                    {status === 'PERMISSION' && dayData?.permissionTimeRange && (
                                        <div className="mt-1 text-center">
                                            <span className="text-xs font-bold text-blue-800 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200 shadow-sm inline-block">
                                                {dayData.permissionTimeRange}
                                            </span>
                                        </div>
                                    )}

                                    {status && (
                                        <div className="mt-auto flex justify-center pb-1">
                                            <span className="text-[11px] font-extrabold uppercase tracking-wide opacity-100 inline-block px-2 py-0.5 rounded-md bg-white/70 backdrop-blur-sm truncate max-w-full shadow-sm text-gray-800 border border-gray-100">
                                                {status.replace('_', ' ')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Legend */}
                <div className="p-3 bg-white border-t border-gray-200 flex justify-center gap-8 text-xs text-gray-600 font-medium shrink-0">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500 shadow-sm"></div> Present</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 shadow-sm"></div> Absent</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm"></div> Half Day</div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500 shadow-sm"></div> Permission</div>
                </div>
            </div>

            {selectedDate && (
                <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 space-y-5 border border-gray-100 animate-in zoom-in-95 duration-200 relative overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-blue-500 to-indigo-600" />

                        <div className="flex justify-between items-center pb-2">
                            <div>
                                <h3 className="font-black text-gray-800 text-base uppercase tracking-tight">{format(new Date(selectedDate), 'MMM dd')}</h3>
                                <p className="text-xs text-gray-400 font-bold">{format(new Date(selectedDate), 'yyyy')}</p>
                            </div>
                            <button onClick={() => setSelectedDate(null)} className="p-2 rounded-full hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors group">
                                <XCircle size={24} />
                            </button>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                <Activity size={10} /> Status
                            </label>
                            <select value={statusInput} onChange={e => setStatusInput(e.target.value)} className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-bold bg-gray-50 focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all appearance-none cursor-pointer">
                                <option value="PRESENT">Present</option>
                                <option value="ABSENT">Absent</option>
                                <option value="HALF_DAY">Half Day</option>
                                <option value="PERMISSION">Permission</option>
                                <option value="LEAVE">Leave</option>
                            </select>
                        </div>

                        {statusInput === 'PERMISSION' && (
                            <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Start</label>
                                        <TimePicker value={permStartTime} onChange={setPermStartTime} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">End</label>
                                        <TimePicker value={permEndTime} onChange={setPermEndTime} />
                                    </div>
                                </div>
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-3 rounded-xl text-center border border-blue-100/50 shadow-sm">
                                    <div className="text-[10px] text-blue-600 font-black uppercase tracking-widest mb-0.5">Duration</div>
                                    <div className="text-2xl font-black text-blue-900 tabular-nums">{String(calPermHrs)} <span className="text-sm opacity-50">hrs</span></div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1">
                                <Edit3 size={10} /> Remarks
                            </label>
                            <textarea
                                value={remarksInput}
                                onChange={e => setRemarksInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSaveDay();
                                    }
                                }}
                                className="w-full border-2 border-gray-100 rounded-xl p-3 text-sm font-medium bg-gray-50 h-24 resize-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                placeholder="Add any notes..."
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button onClick={() => setSelectedDate(null)} className="flex-1 bg-gray-50 text-gray-400 rounded-xl py-3 font-black text-sm hover:bg-gray-100 transition-all active:scale-95 uppercase tracking-wider">
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveDay}
                                disabled={saving}
                                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl py-3 font-black text-sm hover:shadow-lg hover:shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {saving ? "Saving" : "Save"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- STAFF FORM MODAL ---
const StaffFormModal = ({ staff, onClose, onSuccess }: any) => {
    const [formData, setFormData] = useState({
        name: '', email: '', phone: '', emergencyPhone: '', role: 'Employee',
        baseSalary: 10000, allowedPermHours: 2.0, profilePicUrl: '', isActive: true,
        accountNumber: '', ifscCode: '', commissionPercentage: 0,
        hasLoginAccount: false, authUid: ''
    });
    const [enableLogin, setEnableLogin] = useState(false);
    const [loginPassword, setLoginPassword] = useState('');

    const nameRef = useRef<HTMLInputElement>(null);
    const phoneRef = useRef<HTMLInputElement>(null);
    const roleRef = useRef<HTMLSelectElement>(null);
    const emergencyPhoneRef = useRef<HTMLInputElement>(null);
    const salaryRef = useRef<HTMLInputElement>(null);
    const permHoursRef = useRef<HTMLInputElement>(null);
    const accountRef = useRef<HTMLInputElement>(null);
    const ifscRef = useRef<HTMLInputElement>(null);

    const handleEnter = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            nextRef.current?.focus();
        }
    };
    const [roles, setRoles] = useState<Role[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        const fetchRoles = async () => { try { const res = await staffApi.getRoles(); setRoles(res.data || []); } catch (e) { } };
        fetchRoles();
        if (staff) {
            setFormData({
                name: staff.name, email: staff.email || '', phone: staff.phone, emergencyPhone: staff.emergencyPhone || '',
                role: staff.role || 'Employee', baseSalary: staff.baseSalary || 10000,
                allowedPermHours: staff.allowedPermHours || 2.0, profilePicUrl: staff.profilePicUrl || '', isActive: staff.isActive,
                accountNumber: staff.accountNumber || '', ifscCode: staff.ifscCode || '',
                commissionPercentage: staff.commissionPercentage || 0,
                hasLoginAccount: !!staff.hasLoginAccount, authUid: staff.authUid || ''
            });
            setEnableLogin(!!staff.hasLoginAccount || staff.role === 'Admin' || staff.role === 'Cashier');
        }
    }, [staff]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            if (enableLogin && !formData.email) {
                toast.error("Please provide an email address for ERP login.");
                setIsSaving(false);
                return;
            }
            if (enableLogin && !staff?.hasLoginAccount && (!loginPassword || loginPassword.length < 6)) {
                toast.error("Please provide an initial password of at least 6 characters.");
                setIsSaving(false);
                return;
            }

            let savedStaffId = staff?.id;
            if (staff) {
                await staffApi.update(staff.id, formData);
            } else {
                const addRes: any = await staffApi.add(formData);
                savedStaffId = addRes?.data?.id || addRes?.id;
            }

            // Create Firebase Auth login account if requested and password supplied
            if (enableLogin && loginPassword && loginPassword.length >= 6) {
                const authRole = formData.role === 'Admin' ? 'Admin' : 'Cashier';
                const authRes = await createStaffAuthAccount(
                    formData.email,
                    loginPassword,
                    authRole,
                    savedStaffId
                );
                if (!authRes.success) {
                    toast.error(`Staff saved, but Auth account failed: ${authRes.error}`);
                } else {
                    if (savedStaffId) {
                        await staffApi.update(savedStaffId, { hasLoginAccount: true, authUid: authRes.uid });
                    }
                    toast.success(`ERP login provisioned for ${formData.email} (${authRole})`);
                }
            }

            toast.success("Staff details saved successfully");
            onSuccess();
        } catch (error) { 
            console.error("Staff save error:", error);
            toast.error("Operation failed"); 
        } finally { 
            setIsSaving(false); 
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Simple validation
        if (file.size > 5 * 1024 * 1024) { // 5MB
            toast.error("File size must be less than 5MB");
            return;
        }

        setUploading(true);
        try {
            const timestamp = Date.now();
            // Sanitize filename
            const fileName = `staff-profiles/${timestamp}_${file.name.replace(/[^a-zA-Z0-9.]/g, '')}`;
            const storageRef = ref(storage, fileName);

            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);

            setFormData(prev => ({ ...prev, profilePicUrl: downloadURL }));
            toast.success("Image uploaded!");
        } catch (error) {
            console.error(error);
            toast.error("Failed to upload image");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in zoom-in-95">
            <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-800">{staff ? 'Edit Staff' : 'Add New Staff'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors"><XCircle size={24} /></button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Full Name</label>
                            <input ref={nameRef} required className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} onKeyDown={(e) => handleEnter(e, phoneRef)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Phone Number</label>
                            <input ref={phoneRef} required className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none transition-all" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} onKeyDown={(e) => handleEnter(e, roleRef)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Role</label>
                            <select 
                                ref={roleRef} 
                                className="w-full border border-gray-300 rounded-lg p-2.5 bg-white focus:ring-2 focus:ring-blue-500 outline-none" 
                                value={formData.role} 
                                onChange={e => {
                                    const newRole = e.target.value;
                                    setFormData({ ...formData, role: newRole });
                                    if (newRole === 'Admin' || newRole === 'Cashier') {
                                        setEnableLogin(true);
                                    }
                                }} 
                                onKeyDown={(e) => handleEnter(e, emergencyPhoneRef)}
                            >
                                {['Admin', 'Cashier', 'Senior Stylist', 'Junior Stylist', 'Beautician', 'Hair Specialist', 'Employee'].map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">Emergency Contact</label>
                            <input ref={emergencyPhoneRef} className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none" value={formData.emergencyPhone} onChange={e => setFormData({ ...formData, emergencyPhone: e.target.value })} onKeyDown={(e) => handleEnter(e, salaryRef)} />
                        </div>
                    </div>

                    {/* ERP AUTHENTICATION ONBOARDING */}
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                <Shield size={16} className="text-blue-600" /> System Login Access
                            </h4>
                            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={enableLogin}
                                    onChange={e => setEnableLogin(e.target.checked)}
                                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                />
                                <span>Enable ERP Login</span>
                            </label>
                        </div>
                        {enableLogin && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1 pt-2 border-t border-slate-200">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide flex items-center gap-1">
                                        <Mail size={12} /> Email Address
                                    </label>
                                    <input
                                        type="email"
                                        placeholder="employee@mail.com"
                                        required={enableLogin}
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={formData.email}
                                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase tracking-wide flex items-center gap-1">
                                        <Key size={12} /> {staff?.hasLoginAccount ? "New Password (Optional)" : "Login Password"}
                                    </label>
                                    <input
                                        type="password"
                                        placeholder={staff?.hasLoginAccount ? "Leave blank to keep" : "Min 6 characters"}
                                        required={enableLogin && !staff?.hasLoginAccount}
                                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        value={loginPassword}
                                        onChange={e => setLoginPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* EXTENDED SALARY & BANK CONFIG */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Salary Config */}
                        <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 flex flex-col gap-3">
                            <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2"><DollarSign size={16} /> Salary Info</h4>

                            <div>
                                <label className="block text-xs font-bold text-blue-600/70 mb-1">Monthly Base Salary (₹)</label>
                                <input ref={salaryRef} type="number" className="w-full border border-blue-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono" value={formData.baseSalary} onChange={e => setFormData({ ...formData, baseSalary: Number(e.target.value) })} onKeyDown={(e) => handleEnter(e, permHoursRef)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-blue-600/70 mb-1">Allowed Permission (Hrs)</label>
                                <input ref={permHoursRef} type="number" step="0.5" className="w-full border border-blue-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono" value={formData.allowedPermHours} onChange={e => setFormData({ ...formData, allowedPermHours: Number(e.target.value) })} onKeyDown={(e) => handleEnter(e, accountRef)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-blue-600/70 mb-1">Generic Retail Commission (%)</label>
                                <input type="number" step="0.1" className="w-full border border-blue-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono" value={formData.commissionPercentage} onChange={e => setFormData({ ...formData, commissionPercentage: Number(e.target.value) })} title="Fallback commission for retail products. Service commissions are configured per-service." />
                            </div>
                        </div>

                        {/* Bank Details */}
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-3">
                            <h4 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Briefcase size={16} /> Bank Details</h4>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">Account Number</label>
                                <input ref={accountRef} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono text-sm" value={formData.accountNumber} onChange={e => setFormData({ ...formData, accountNumber: e.target.value })} onKeyDown={(e) => handleEnter(e, ifscRef)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase">IFSC Code</label>
                                <input ref={ifscRef} className="w-full border border-gray-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-mono text-sm uppercase" value={formData.ifscCode} onChange={e => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(e as any); } }} />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wide flex items-center gap-2">
                            <UploadCloud size={16} /> Profile Picture
                        </label>

                        <div className="flex items-center gap-4">
                            <div className="shrink-0">
                                {formData.profilePicUrl ? (
                                    <div className="relative group/img w-20 h-20">
                                        <img src={formData.profilePicUrl} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-white shadow-md" />
                                        <button
                                            type="button"
                                            onClick={() => setFormData({ ...formData, profilePicUrl: '' })}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 shadow-sm opacity-0 group-hover/img:opacity-100 transition-opacity"
                                        >
                                            <XCircle size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-slate-300 border-2 border-dashed border-slate-200">
                                        <User size={32} />
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 relative group bg-white">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileUpload}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                                    disabled={uploading}
                                />
                                <div className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all duration-200 
                                    ${uploading ? 'bg-blue-50 border-blue-300' : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50/30'}`}>

                                    {uploading ? (
                                        <div className="flex flex-col items-center gap-2 text-blue-600">
                                            <Loader2 size={24} className="animate-spin" />
                                            <span className="text-sm font-semibold">Uploading...</span>
                                        </div>
                                    ) : (
                                        <div className="flex gap-3 items-center text-gray-500 group-hover:text-blue-600 transition-colors">
                                            <div className="p-2 bg-gray-100 rounded-lg group-hover:bg-blue-100 transition-colors">
                                                <UploadCloud size={20} />
                                            </div>
                                            <div className="text-left">
                                                <p className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">Click to upload</p>
                                                <p className="text-xs text-gray-400">SVG, PNG, JPG or GIF (max. 5MB)</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2">
                        <input type="checkbox" id="active" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500" />
                        <label htmlFor="active" className="text-sm font-medium text-gray-700 cursor-pointer select-none">Active Staff Member</label>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-sm text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">Cancel</button>
                        <button type="submit" disabled={isSaving} className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium shadow-md transition-all transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2">
                            {isSaving && <Loader2 size={16} className="animate-spin" />}
                            {isSaving ? "Saving..." : "Save Staff"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- NEW COMPONENT: TIME PICKER ---
const TimePicker = ({ value, onChange }: { value: string, onChange: (v: string) => void }) => {
    const [hours, setHours] = useState(value.split(':')[0] || "10");
    const [minutes, setMinutes] = useState(value.split(':')[1] || "00");

    const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const minuteOptions = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0')); // 00, 05, 10...

    const hourRef = useRef<HTMLDivElement>(null);
    const minRef = useRef<HTMLDivElement>(null);

    const handleHourChange = (newHour: string) => {
        setHours(newHour);
        onChange(`${newHour}:${minutes}`);
    };

    const handleMinuteChange = (newMinute: string) => {
        setMinutes(newMinute);
        onChange(`${hours}:${newMinute}`);
    };

    // Update internal state if valid prop changes
    useEffect(() => {
        if (value && value.includes(':')) {
            const [h, m] = value.split(':');
            if (h) setHours(h);
            if (m) setMinutes(m);
        }
    }, [value]);

    // Auto-scroll logic
    useEffect(() => {
        if (hourRef.current) {
            const idx = hourOptions.indexOf(hours);
            if (idx !== -1) {
                hourRef.current.scrollTo({ top: idx * 32, behavior: 'smooth' });
            }
        }
    }, [hours, hourOptions]);

    useEffect(() => {
        if (minRef.current) {
            const idx = minuteOptions.indexOf(minutes);
            if (idx !== -1) {
                minRef.current.scrollTo({ top: idx * 32, behavior: 'smooth' });
            }
        }
    }, [minutes, minuteOptions]);

    return (
        <div className="flex bg-gray-50 border border-gray-200 rounded-xl overflow-hidden shadow-inner h-36 relative group">
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
                <div className="w-full h-8 bg-blue-600/10 border-t border-b border-blue-500/20" />
            </div>

            {/* Hours Column */}
            <div
                ref={hourRef}
                className="flex-1 overflow-y-auto no-scrollbar snap-y snap-mandatory py-14"
            >
                {hourOptions.map(h => (
                    <div
                        key={h}
                        onClick={() => handleHourChange(h)}
                        className={`h-8 flex items-center justify-center text-base font-bold snap-center cursor-pointer transition-all duration-300 ${hours === h ? 'text-blue-600 scale-125 z-20' : 'text-gray-400 opacity-40 hover:opacity-100 hover:text-gray-600'}`}
                    >
                        {h}
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-center font-black text-blue-200 pb-1 text-xl">:</div>

            {/* Minutes Column */}
            <div
                ref={minRef}
                className="flex-1 overflow-y-auto no-scrollbar snap-y snap-mandatory py-14"
            >
                {minuteOptions.map(m => (
                    <div
                        key={m}
                        onClick={() => handleMinuteChange(m)}
                        className={`h-8 flex items-center justify-center text-base font-bold snap-center cursor-pointer transition-all duration-300 ${minutes === m ? 'text-blue-600 scale-125 z-20' : 'text-gray-400 opacity-40 hover:opacity-100 hover:text-gray-600'}`}
                    >
                        {m}
                    </div>
                ))}
            </div>



            <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-gray-50 to-transparent pointer-events-none z-0" />
            <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none z-0" />
        </div>
    );
};

export default StaffManagement;
