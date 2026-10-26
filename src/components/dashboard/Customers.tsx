import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
    Pencil, Trash2, PlusCircle, X, Upload, Users, Loader2, 
    Clock, MapPin, Phone, FileText, Search, User, Mail, 
    Eye, AlertCircle, CheckCircle2, IndianRupee, ArrowLeft,
    CreditCard, RefreshCw
} from 'lucide-react';
import { customerService, customerApi, billingApi, Customer, CustomerPurchase, Bill } from '@/lib/api';
import { useGlobalData } from '@/context/GlobalDataContext';
import Papa from 'papaparse';
import { SyncIndicator } from '@/components/SyncIndicator';
import { useConfirm } from '@/hooks/useConfirm';
import { motion } from 'framer-motion';

// --- Kamal Style Components (Supplier Credit UI) ---

const StatusBadge = ({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) => {
    const s = label?.toUpperCase() || 'PAID';
    
    let theme = "";
    if (s === 'PAID') theme = "bg-green-50 text-green-700 border-green-200";
    else if (s === 'PENDING') theme = "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
    else theme = "bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100";

    const isClickable = onClick && s !== 'CANCELLED' && s !== 'PAID';

    return (
        <button
            onClick={(e) => { e.stopPropagation(); if (isClickable && onClick) onClick(); }}
            disabled={disabled || !isClickable}
            className={`text-[10px] px-2 py-0.5 rounded border font-black uppercase transition-all shadow-sm ${theme} ${isClickable ? 'cursor-pointer active:scale-95' : 'cursor-default'}`}
        >
            {s}
        </button>
    );
};

const PaymentModal = ({ customerId, customerName, bill, onClose, onPaymentRecorded }: { customerId: string; customerName: string; bill: CustomerPurchase; onClose: () => void; onPaymentRecorded: () => void }) => {
    const [amount, setAmount] = useState<number>(bill.balance || 0);
    const [mode, setMode] = useState<'CASH' | 'UPI' | 'ONLINE' | 'CHEQUE'>('CASH');
    const [remarks, setRemarks] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handlePaymentSubmit = async () => {
        if (amount <= 0 || amount > (bill.balance || 0) + 0.01) {
            toast.error("Invalid payment amount");
            return;
        }

        setIsProcessing(true);
        try {
            await billingApi.recordPayment(bill.id, amount, mode, remarks);
            toast.success("Payment recorded successfully");
            onPaymentRecorded();
            onClose();
        } catch (error) {
            console.error("Payment failed", error);
            toast.error("Failed to record payment");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9999] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-black/5">
                <div className="bg-gradient-to-r from-blue-600 via-blue-600 to-indigo-600 p-6 text-white relative">
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                        <CreditCard size={80} />
                    </div>
                    <h2 className="text-xl font-bold relative z-10 tracking-tight">Record Payment</h2>
                    <p className="text-blue-50 text-sm mt-1 relative z-10 opacity-90">{customerName} • Bill #{bill.id}</p>
                </div>

                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 shadow-sm">
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Bill</p>
                            <p className="text-base font-bold text-slate-800 font-mono">₹{bill.amount.toLocaleString()}</p>
                        </div>
                        <div className="bg-rose-50 p-3 rounded-xl border border-rose-100 shadow-sm">
                            <p className="text-[10px] text-rose-500 uppercase font-bold tracking-wider">Outstanding</p>
                            <p className="text-base font-bold text-rose-700 font-mono">₹{bill.balance.toLocaleString()}</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Amount</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-bold">₹</span>
                            <input
                                type="number"
                                className="w-full border-2 border-slate-100 bg-slate-50/50 rounded-xl pl-8 pr-4 py-3 focus:bg-white focus:border-blue-500 focus:ring-0 outline-none transition-all font-bold text-base"
                                value={amount || ''}
                                autoFocus
                                placeholder="0.00"
                                onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                            />
                        </div>
                        <div className="flex justify-between mt-1">
                            <p className="text-[10px] text-gray-400">Enter amount to pay</p>
                            <button onClick={() => setAmount(bill.balance)} className="text-[10px] text-blue-600 font-bold hover:underline">Pay Full Balance</button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Payment Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                            {['CASH', 'UPI', 'ONLINE', 'CHEQUE'].map(m => (
                                <button
                                    key={m}
                                    onClick={() => setMode(m as any)}
                                    className={`py-2 px-3 rounded-lg text-xs font-bold border-2 transition-all duration-200 ${mode === m
                                        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-600 text-blue-700 shadow-sm'
                                        : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200 hover:text-slate-600'
                                        }`}
                                >
                                    {m}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Remarks (Optional)</label>
                        <textarea
                            className="w-full border-2 border-slate-100 bg-slate-50/50 rounded-xl p-3 text-sm focus:bg-white focus:border-blue-500 focus:ring-0 outline-none transition-all min-h-[80px]"
                            placeholder="Add payment notes..."
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                        />
                    </div>
                </div>

                <div className="p-6 bg-slate-50/80 border-t border-slate-100 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-200/50 transition-all duration-200">Cancel</button>
                    <button
                        onClick={handlePaymentSubmit}
                        disabled={isProcessing || amount <= 0 || amount > bill.balance}
                        className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-200/50 flex items-center justify-center gap-2"
                    >
                        {isProcessing ? <RefreshCw size={18} className="animate-spin" /> : 'Confirm Payment'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

const HistoryModal = ({ bill, customerName, onClose }: { bill: CustomerPurchase; customerName: string; onClose: () => void }) => {
    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[9999] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden ring-1 ring-black/5 flex flex-col max-h-[85vh]">
                <div className="bg-gradient-to-r from-blue-50 via-white to-white px-6 py-5 flex justify-between items-center border-b border-indigo-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50/30 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                    <div className="relative z-10">
                        <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
                            <RefreshCw size={20} className="text-blue-600" />
                            <span>Payment History</span>
                        </h2>
                        <p className="text-slate-500 text-sm mt-0.5 font-medium">
                            {customerName} <span className="mx-2 text-slate-300">•</span> Bill ID: <span className="font-mono text-blue-600 font-bold">{bill.id}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="relative z-10 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all duration-200">
                        <X size={18} strokeWidth={3} />
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-6 px-6 py-6 border-b bg-slate-50/50">
                    <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                        <p className="text-[10px] text-slate-500 uppercase font-extrabold tracking-widest mb-1">Total Bill</p>
                        <p className="text-xl font-black text-slate-800 font-mono">₹{bill.amount.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-50/50 p-4 rounded-xl border border-green-100 shadow-sm">
                        <p className="text-[10px] text-green-600 uppercase font-extrabold tracking-widest mb-1">Total Paid</p>
                        <p className="text-xl font-black text-green-600 font-mono">₹{bill.paidAmount.toLocaleString()}</p>
                    </div>
                    <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-100 shadow-sm">
                        <p className="text-[10px] text-rose-600 uppercase font-extrabold tracking-widest mb-1">Outstanding</p>
                        <p className="text-xl font-black text-rose-600 font-mono">₹{bill.balance.toLocaleString()}</p>
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto custom-scrollbar">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Items Purchased</h3>
                        <div className="space-y-2">
                            {bill.items && bill.items.length > 0 ? bill.items.map((item: any, idx: number) => {
                                const itemName = item.productName || item.name || item.serviceName || 'Unknown Item';
                                const itemTotal = Number(item.netAmount || item.total || (Number(item.price || 0) * Number(item.qty || 1)) || 0);
                                return (
                                    <div key={idx} className="flex justify-between items-center bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 font-bold text-[10px]">
                                                {item.qty || 1}x
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-700 text-sm">{itemName}</p>
                                            </div>
                                        </div>
                                        <p className="font-bold text-slate-700 font-mono">₹{itemTotal.toFixed(2)}</p>
                                    </div>
                                );
                            }) : (
                                <p className="text-slate-400 text-xs italic">No items recorded.</p>
                            )}
                        </div>
                    </div>

                    <div className="p-4 bg-slate-50">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Payment Records</h3>
                    </div>
                    {!bill.paymentHistory || bill.paymentHistory.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 text-sm bg-white">No payment records available.</div>
                    ) : (
                        <table className="w-full text-sm border-collapse bg-white">
                            <thead className="bg-gray-100 text-gray-600 uppercase text-xs sticky top-0 z-10">
                                <tr>
                                    <th className="px-5 py-3 text-left border-y border-slate-200">Date</th>
                                    <th className="px-5 py-3 text-right border-y border-slate-200">Paid Amount</th>
                                    <th className="px-5 py-3 text-center border-y border-slate-200">Mode</th>
                                    <th className="px-5 py-3 text-right border-y border-slate-200">Balance After</th>
                                    <th className="px-5 py-3 text-left border-y border-slate-200">Remarks</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bill.paymentHistory.map((h, i) => (
                                    <tr key={i} className="border-b hover:bg-indigo-50/40 transition-colors duration-150">
                                        <td className="px-5 py-3 text-gray-800 font-medium">{new Date(h.paymentDate).toLocaleDateString()}</td>
                                        <td className="px-5 py-3 text-right font-bold text-green-600">₹{h.amount.toLocaleString()}</td>
                                        <td className="px-5 py-4 text-center">
                                            <span className="px-3 py-1 text-[10px] font-bold rounded-full border bg-gradient-to-r from-slate-50 to-slate-100 text-slate-700 border-slate-200 uppercase tracking-tighter">
                                                {h.paymentMode}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-right font-semibold text-gray-800">₹{h.balanceAfterPayment.toLocaleString()}</td>
                                        <td className="px-5 py-3 text-gray-600 text-xs">{h.description || '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="px-6 py-5 bg-gradient-to-t from-slate-50/80 to-white border-t border-slate-100 flex justify-end">
                    <button onClick={onClose} className="px-10 py-2.5 text-sm font-bold bg-white text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 transition-all duration-200 shadow-sm">Close History</button>
                </div>
            </motion.div>
        </div>
    );
};

// --- Main Component ---

const Customers = () => {
    const navigate = useNavigate();
    const { customers, bills, cancelledBills: globalCancelled, loading: globalLoading, refreshCustomers, refreshBills, refreshCancelled, isSyncing } = useGlobalData();
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [history, setHistory] = useState<CustomerPurchase[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [searchParams] = useSearchParams();
    const highlightId = searchParams.get('highlight');
    const highlightStatus = searchParams.get('status');
    const highlightBillId = searchParams.get('billId');
    const paymentReminderRef = useRef<HTMLDivElement>(null);

    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedBill, setSelectedBill] = useState<CustomerPurchase | null>(null);
    const [isPayModalOpen, setIsPayModalOpen] = useState(false);
    const [billToPay, setBillToPay] = useState<CustomerPurchase | null>(null);

    const { confirm: showConfirmation, ConfirmationDialog } = useConfirm();

    useEffect(() => {
        refreshBills();
        refreshCancelled();
    }, []);

    useEffect(() => {
        if (selectedCustomer) {
            fetchHistory();
        } else {
            setHistory([]);
        }
    }, [selectedCustomer, bills, globalCancelled]);

    useEffect(() => {
        if (customers) {
            const updated = customers.find(c => c.id === selectedCustomer?.id);
            if (updated && updated !== selectedCustomer) {
                setSelectedCustomer(updated);
            }
        }
    }, [customers]);

    useEffect(() => {
        if (highlightId && customers.length > 0) {
            const customer = customers.find(c =>
                c.id === highlightId ||
                c.phone === highlightId ||
                (c.phone && highlightId && c.phone.replace(/\D/g, '').includes(highlightId.replace(/\D/g, '')))
            );

            if (customer) {
                setSelectedCustomer(customer);
                setSearchTerm('');
            }
        }
    }, [highlightId, customers]);

    useEffect(() => {
        if (selectedCustomer && highlightBillId && paymentReminderRef.current) {
            setTimeout(() => {
                paymentReminderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        }
    }, [selectedCustomer, highlightBillId]);

    const fetchHistory = async () => {
        if (!selectedCustomer) return;
        setIsHistoryLoading(true);
        try {
            const mergedBills = [...(bills || []), ...(globalCancelled || [])];
            const customerBills = mergedBills.filter((b: any) => {
                if ((b.customerId && b.customerId === selectedCustomer.id) ||
                    (b.customer_id && b.customer_id === selectedCustomer.id)) return true;
                if (selectedCustomer.phone) {
                    const cPhone = selectedCustomer.phone.toString().replace(/\D/g, '');
                    const bPhone = (b.customerPhone || '').toString().replace(/\D/g, '');
                    if (cPhone.length > 5 && bPhone.length > 5 && cPhone === bPhone) return true;
                }
                if (selectedCustomer.name && b.customerName) {
                    return b.customerName.toString().trim().toLowerCase() === selectedCustomer.name.toString().trim().toLowerCase();
                }
                return false;
            });

            const purchases: CustomerPurchase[] = customerBills.map((b: any) => {
                const total = b.finalAmount || b.totalAmount || 0;
                const paid = b.amountPaid || 0;
                const balance = Math.max(0, total - paid);
                
                let status = b.status || 'PAID';
                if (status === 'PAID' && balance > 1) status = 'PARTIAL';
                if (status === 'PARTIAL' && balance === 0) status = 'PAID';

                return {
                    id: b.id || b.invoiceNumber,
                    date: b.createdAt || b.date,
                    amount: total,
                    paidAmount: paid,
                    balance: balance,
                    paymentMethod: b.paymentMethod,
                    status: status,
                    items: b.items,
                    paymentHistory: b.paymentHistory
                };
            });

            setHistory(purchases);
        } catch (error) {
            console.error("Failed to load history", error);
        } finally {
            setIsHistoryLoading(false);
        }
    };

    const handleSaveCustomer = async (customer: Omit<Customer, 'id'> & { id?: string }) => {
        if (!customer.id) {
            const isDuplicate = customers.some(
                c => c.name.trim().toLowerCase() === customer.name.trim().toLowerCase() ||
                    (c.phone && c.phone === customer.phone)
            );
            if (isDuplicate) {
                showConfirmation(`Customer "${customer.name}" or phone "${customer.phone}" already exists. Continue?`, () => saveCustomerLogic(customer));
                return;
            }
        }
        await saveCustomerLogic(customer);
    };

    const saveCustomerLogic = async (customer: any) => {
        setIsSaving(true);
        try {
            const payload = { 
                name: customer.name, 
                phone: customer.phone, 
                address: customer.address, 
                gstin: customer.gstNo || customer.gstin, 
                email: customer.email,
                dob: customer.dob,
                anniversary: customer.anniversary,
                preferredStaff: customer.preferredStaff,
                notes: customer.notes
            };
            if (customer.id) {
                await customerApi.update(customer.id, payload);
                toast.success('Updated!');
            } else {
                await customerApi.add(payload);
                toast.success('Added!');
            }
            await refreshCustomers();
            handleCloseModal();
            if (selectedCustomer?.id === customer.id) setSelectedCustomer({ ...selectedCustomer, ...payload, gstin: payload.gstin });
        } catch (err) { toast.error('Save failed.'); } finally { setIsSaving(false); }
    };

    const handleDeleteCustomer = async (id: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        showConfirmation('Delete this customer?', async () => {
            setDeletingId(id);
            try {
                await customerApi.delete(id);
                toast.success('Deleted!');
                if (selectedCustomer?.id === id) setSelectedCustomer(null);
                await refreshCustomers();
            } catch (err) { toast.error('Delete failed.'); } finally { setDeletingId(null); }
        });
    };

    const handleUploadClick = () => fileInputRef.current?.click();
    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data as any[];
                let success = 0, failed = 0;
                for (const row of rows) {
                    try {
                        await customerService.post('/customers/add', { name: row.name, phone: row.contact || row.phone, address: row.address, gstin: row.gst || row.gstin });
                        success++;
                    } catch (err) { failed++; }
                }
                toast.success(`${success} added!`);
                await refreshCustomers();
                setLoading(false);
            }
        });
    };

    const handleOpenModal = (c: Customer | null) => { setEditingCustomer(c); setIsModalOpen(true); };
    const handleCloseModal = () => { setIsModalOpen(false); setEditingCustomer(null); };

    const filteredCustomers = customers.filter(c => 
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.phone?.includes(searchTerm) || 
        c.gstin?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredHistory = history.filter(h => {
        if (!h.date) return true;
        const purchaseDate = new Date(h.date);
        if (startDate && purchaseDate < new Date(startDate)) return false;
        if (endDate && purchaseDate > new Date(endDate + 'T23:59:59')) return false;
        return true;
    });

    const totalSpent = filteredHistory.reduce((sum, h) => (h.status === 'CANCELLED' || h.status === 'HOLD') ? sum : sum + (Number(h.amount) || 0), 0);
    const totalPaid = filteredHistory.reduce((sum, h) => (h.status === 'CANCELLED' || h.status === 'HOLD') ? sum : sum + (Number(h.paidAmount) || 0), 0);
    const pendingBalance = totalSpent - totalPaid;
    const visitCount = filteredHistory.filter(h => h.status !== 'CANCELLED' && h.status !== 'HOLD').length;
    const sortedHistory = [...filteredHistory].sort((a, b) => new Date(b.date || '').getTime() - new Date(a.date || '').getTime());

    const lastVisit = useMemo(() => {
        if (selectedCustomer?.lastVisit) return new Date(selectedCustomer.lastVisit).toLocaleDateString();
        if (sortedHistory.length > 0 && sortedHistory[0].date) return new Date(sortedHistory[0].date).toLocaleDateString();
        return 'N/A';
    }, [selectedCustomer, sortedHistory]);

    return (
        <div className="flex h-[calc(100vh-100px)] gap-6 p-6">
            <ConfirmationDialog />
            <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />

            <div className="w-1/3 bg-white rounded-lg shadow-sm flex flex-col border border-gray-200 overflow-hidden">
                <div className="p-4 border-b">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <Users className="text-blue-600" size={24} /> Customers
                        </h2>
                        <div className="flex gap-2">
                            <button onClick={handleUploadClick} className="p-2 bg-green-100 text-green-700 rounded-full hover:bg-green-200"><Upload size={18} /></button>
                            <button onClick={() => handleOpenModal(null)} className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700"><PlusCircle size={20} /></button>
                        </div>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                        <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2 border rounded-lg w-full outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" />
                    </div>
                </div>
                <div className="overflow-y-auto flex-grow custom-scrollbar">
                    {filteredCustomers.map(c => (
                        <div key={c.id} onClick={() => setSelectedCustomer(c)} className={`p-4 border-b cursor-pointer hover:bg-gray-50 flex justify-between items-center group ${selectedCustomer?.id === c.id ? 'bg-blue-50 border-blue-200' : ''}`}>
                            <div>
                                <div className="font-semibold text-gray-800">{c.name}</div>
                                <div className="text-sm text-gray-500">{c.phone || 'No phone'}</div>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); navigate(`/admin/customers/${c.id}`); }} className="text-emerald-600 hover:text-emerald-800 p-1"><Eye size={16} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleOpenModal(c); }} className="text-blue-600"><Pencil size={16} /></button>
                                <button onClick={(e) => handleDeleteCustomer(c.id, e)} className="text-red-500"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="w-2/3 flex flex-col gap-6 overflow-hidden">
                {selectedCustomer ? (
                    <>
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><User className="text-gray-400" size={28} /> {selectedCustomer.name}</h1>
                                    <div className="text-sm text-gray-500 font-mono">ID: {selectedCustomer.id}</div>
                                </div>
                                <button onClick={() => handleOpenModal(selectedCustomer)} className="p-2 text-gray-400 hover:text-blue-600"><Pencil size={20} /></button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex items-center gap-2"><Phone size={16} className="text-blue-600" /> <span className="text-sm">{selectedCustomer.phone || 'N/A'}</span></div>
                                <div className="flex items-center gap-2"><Mail size={16} className="text-green-600" /> <span className="text-sm truncate">{selectedCustomer.email || 'N/A'}</span></div>
                                <div className="flex items-center gap-2"><FileText size={16} className="text-purple-600" /> <span className="text-sm">{selectedCustomer.gstin || 'N/A'}</span></div>
                                <div className="flex items-center gap-2"><MapPin size={16} className="text-orange-600" /> <span className="text-sm truncate">{selectedCustomer.address || 'N/A'}</span></div>
                                {selectedCustomer.dob && <div className="flex items-center gap-2"><Clock size={16} className="text-pink-600" /> <span className="text-sm">DOB: {new Date(selectedCustomer.dob).toLocaleDateString()}</span></div>}
                                {selectedCustomer.anniversary && <div className="flex items-center gap-2"><Clock size={16} className="text-red-500" /> <span className="text-sm">Anniv: {new Date(selectedCustomer.anniversary).toLocaleDateString()}</span></div>}
                            </div>
                            {selectedCustomer.notes && (
                                <div className="mt-4 p-3 bg-amber-50 rounded border border-amber-100 text-sm text-amber-800 whitespace-pre-wrap">
                                    <strong>Notes:</strong> {selectedCustomer.notes}
                                </div>
                            )}
                        </div>

                        {highlightBillId && (() => {
                            const bill = bills.find((b: any) => b.id === highlightBillId);
                            if (!bill) return null;
                            const deadlineDate = new Date(bill.createdAt || new Date());
                            deadlineDate.setDate(deadlineDate.getDate() + (Number(bill.expiryDays) || 30));
                            return (
                                <div ref={paymentReminderRef} className="p-6 rounded-xl border-2 border-amber-200 bg-amber-50 flex justify-between items-center shadow-sm">
                                    <div className="flex gap-4 items-center">
                                        <div className="p-3 bg-white rounded-full text-amber-500 shadow-sm"><AlertCircle size={28} /></div>
                                        <div>
                                            <h3 className="font-bold text-amber-800">Payment Reminder #{bill.invoiceNumber || bill.id}</h3>
                                            <p className="text-sm text-amber-700">Balance: ₹{((bill.finalAmount || 0) - (bill.amountPaid || 0)).toLocaleString()} • Due by {deadlineDate.toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <button onClick={() => { setBillToPay({ id: bill.id, amount: bill.finalAmount, balance: (bill.finalAmount || 0) - (bill.amountPaid || 0), status: bill.status, paymentHistory: bill.paymentHistory } as any); setIsPayModalOpen(true); }} className="px-3 py-1.5 text-sm bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-700 shadow-sm">Pay Now</button>
                                </div>
                            );
                        })()}

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-blue-600">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bill Total</p>
                                <p className="text-base font-black text-blue-700 mt-1">₹{totalSpent.toLocaleString()}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-green-500">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Paid</p>
                                <p className="text-base font-black text-green-700 mt-1">₹{totalPaid.toLocaleString()}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-red-500">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Pending</p>
                                <p className="text-base font-black text-red-700 mt-1">₹{pendingBalance.toLocaleString()}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-emerald-500">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Visits</p>
                                <p className="text-base font-black text-emerald-700 mt-1">{visitCount}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-orange-500">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Last Visit</p>
                                <p className="text-base font-black text-orange-700 mt-1">{lastVisit}</p>
                            </div>
                            <div className="bg-white p-4 rounded-lg shadow-sm border-l-4 border-purple-500">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Loyalty Pts</p>
                                <p className="text-base font-black text-purple-700 mt-1">{selectedCustomer.loyaltyPoints || 0}</p>
                            </div>
                        </div>

                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-grow flex flex-col overflow-hidden">
                            <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2 uppercase text-xs tracking-widest"><Clock size={16} /> Purchase History</h3>
                                <div className="flex gap-2">
                                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="text-[10px] border rounded p-1.5 outline-none font-bold text-gray-600" />
                                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="text-[10px] border rounded p-1.5 outline-none font-bold text-gray-600" />
                                </div>
                            </div>
                            <div className="overflow-y-auto flex-grow custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-gray-50 sticky top-0 z-10">
                                        <tr className="border-b">
                                            <th className="p-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                                            <th className="p-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Bill ID</th>
                                            <th className="p-4 text-[9px] font-black text-gray-400 uppercase tracking-widest text-right">Bill Total</th>
                                            <th className="p-4 text-[9px] font-black text-green-500 uppercase tracking-widest text-right">Paid</th>
                                            <th className="p-4 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                                            <th className="p-4 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">History</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {sortedHistory.map((h, i) => (
                                            <tr key={i} className="hover:bg-blue-50/20 transition-colors h-14">
                                                <td className="p-4 text-xs font-bold text-gray-700">
                                                    <div>{h.date ? new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}</div>
                                                    <div className="text-[10px] text-gray-400">{h.date ? new Date(h.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                                                </td>
                                                <td className="p-4 text-xs font-mono text-blue-600 font-bold">#{h.id?.slice(-8).toUpperCase()}</td>
                                                <td className="p-4 text-sm font-black text-right text-gray-800">₹{h.amount.toLocaleString()}</td>
                                                <td className="p-4 text-sm font-black text-right text-green-600">₹{(h.paidAmount || 0).toLocaleString()}</td>
                                                <td className="p-4 text-center">
                                                    <StatusBadge label={h.status} onClick={() => { setBillToPay(h); setIsPayModalOpen(true); }} />
                                                </td>
                                                <td className="p-4 text-center">
                                                    <button onClick={() => { setSelectedBill(h); setIsHistoryModalOpen(true); }} className="p-2 text-gray-400 hover:text-blue-600 transition-colors" title="View Timeline"><Clock size={18} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-grow flex flex-col items-center justify-center bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                        <Users size={64} className="text-gray-200 mb-4" />
                        <h3 className="text-base font-bold text-gray-400 uppercase tracking-widest">Select a customer</h3>
                    </div>
                )}
            </div>

            {isModalOpen && <CustomerFormModal customer={editingCustomer} onSave={handleSaveCustomer} onClose={handleCloseModal} isSaving={isSaving} />}
            {isPayModalOpen && billToPay && selectedCustomer && <PaymentModal customerId={selectedCustomer.id} customerName={selectedCustomer.name} bill={billToPay} onClose={() => setIsPayModalOpen(false)} onPaymentRecorded={() => { refreshBills(); refreshCustomers(); fetchHistory(); }} />}
            {isHistoryModalOpen && selectedBill && <HistoryModal bill={selectedBill} customerName={selectedCustomer?.name || ''} onClose={() => setIsHistoryModalOpen(false)} />}
        </div>
    );
};

const CustomerFormModal = ({ customer, onSave, onClose, isSaving }: { customer: Customer | null; onSave: any; onClose: () => void; isSaving?: boolean }) => {
    const { staff } = useGlobalData();
    const [form, setForm] = useState({ 
        name: customer?.name || '', 
        phone: customer?.phone || '', 
        gstNo: customer?.gstin || '', 
        address: customer?.address || '', 
        email: customer?.email || '',
        dob: customer?.dob || '',
        anniversary: customer?.anniversary || '',
        preferredStaff: customer?.preferredStaff || '',
        notes: customer?.notes || ''
    });
    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-xl border max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-8 border-b pb-4">
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">{customer ? 'Edit Profile' : 'New Customer'}</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="space-y-5">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name</label>
                        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enter customer name" className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Phone Number</label>
                        <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="10-digit mobile" className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">GSTIN</label>
                        <input value={form.gstNo} onChange={e => setForm({ ...form, gstNo: e.target.value })} placeholder="Optional" className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Address</label>
                        <textarea value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full address" className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={2} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Date of Birth</label>
                            <input type="date" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-gray-600" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Anniversary</label>
                            <input type="date" value={form.anniversary} onChange={e => setForm({ ...form, anniversary: e.target.value })} className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-gray-600" />
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Preferred Staff</label>
                        <select value={form.preferredStaff} onChange={e => setForm({ ...form, preferredStaff: e.target.value })} className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 text-gray-600">
                            <option value="">No Preference</option>
                            {staff.filter((s: any) => s.isActive !== false).map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Notes</label>
                        <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Customer preferences, allergies, etc." className="w-full p-3 bg-gray-50 border rounded-xl font-bold outline-none focus:ring-2 focus:ring-blue-500 resize-none" rows={2} />
                    </div>
                </div>
                <div className="flex gap-4 mt-10">
                    <button onClick={onClose} className="flex-1 py-4 bg-gray-100 text-gray-500 font-bold rounded-2xl hover:bg-gray-200 transition-colors">Cancel</button>
                    <button onClick={() => onSave(form)} disabled={isSaving} className="flex-1 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100">{isSaving ? <Loader2 size={20} className="animate-spin mx-auto" /> : 'Save Profile'}</button>
                </div>
            </div>
        </div>
    );
};

export default Customers;
