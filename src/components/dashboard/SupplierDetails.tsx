import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Building2, Phone, MapPin, ArrowLeft,
  Package, AlertCircle, Eye, RefreshCw,
  PlusCircle, Search, FileText, CheckCircle2,
  ShieldCheck, ExternalLink, Pencil, X, Save,
  Loader2, AlertTriangle, Sparkles, TrendingUp
} from 'lucide-react';
import {
  vendorApi, vendorService, Vendor, Product
} from '@/lib/api';
import { useGlobalData } from '@/context/GlobalDataContext';
import toast from 'react-hot-toast';
import { SyncIndicator } from '@/components/SyncIndicator';

const SupplierDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { vendors, products, refreshVendors, refreshProducts, isSyncing } = useGlobalData();

  const [supplier, setSupplier] = useState<Vendor | null>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'products' | 'transactions'>('products');
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    nickname: '',
    contact: '',
    gst: '',
    address: '',
    vendorInvoice: '',
  });

  // Fetch Supplier and Purchase History
  const fetchSupplierData = async () => {
    if (!id) return;
    setLoading(true);
    try {
      // 1. Locate in global data or fetch via API
      let found = vendors.find(v => v.id === id || v.name.toLowerCase() === id.toLowerCase());
      try {
        const res = await vendorApi.getVendor(id);
        if (res?.data) {
          found = res.data;
        }
      } catch (err) {
        console.warn('Direct vendor fetch failed, using memory state:', err);
      }
      setSupplier(found || null);

      if (found) {
        setEditForm({
          name: found.name || '',
          nickname: found.nickname || '',
          contact: found.phone || '',
          gst: found.gstin || '',
          address: found.address || '',
          vendorInvoice: found.vendorInvoice || '',
        });

        // 2. Fetch credits / transactions if available
        try {
          const txRes = await vendorApi.getCredits(found.id);
          const txList = Array.isArray(txRes.data) ? txRes.data : [];
          txList.sort((a, b) => {
            const dateA = new Date(a.date || a.createdAt || 0).getTime();
            const dateB = new Date(b.date || b.createdAt || 0).getTime();
            return dateB - dateA;
          });
          setTransactions(txList);
        } catch (txErr) {
          console.warn('No external transactions for supplier:', txErr);
          setTransactions([]);
        }
      }
    } catch (err) {
      console.error('Failed to load supplier details:', err);
      toast.error('Failed to load supplier details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSupplierData();
  }, [id, vendors]);

  // Products supplied by this vendor
  const vendorProducts = useMemo(() => {
    if (!id) return [];
    return products.filter(p => {
      const matchId = p.vendorId && (p.vendorId === id || p.vendorId === supplier?.id);
      const matchName = supplier?.name && p.vendorName && p.vendorName.toLowerCase().trim() === supplier.name.toLowerCase().trim();
      const matchNickname = supplier?.nickname && (p as any).vendorNickname && (p as any).vendorNickname.toLowerCase().trim() === supplier.nickname.toLowerCase().trim();
      return matchId || matchName || matchNickname;
    });
  }, [id, products, supplier]);

  // Categories list among this vendor's products
  const availableCategories = useMemo(() => {
    return Array.from(new Set(vendorProducts.map(p => p.category).filter(Boolean)));
  }, [vendorProducts]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    let list = vendorProducts;
    if (categoryFilter !== 'ALL') {
      list = list.filter(p => p.category === categoryFilter);
    }
    if (productSearch.trim()) {
      const q = productSearch.toLowerCase().trim();
      list = list.filter(p =>
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.id && p.id.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    }
    return list;
  }, [vendorProducts, categoryFilter, productSearch]);

  // Financial & Stock Metrics
  const metrics = useMemo(() => {
    let totalStockUnits = 0;
    let totalStockCost = 0;
    let totalRetailValue = 0;
    let lowStockCount = 0;

    vendorProducts.forEach(p => {
      const qty = Number(p.stockQuantity) || 0;
      const buyRate = Number(p.purchaseRate) || 0;
      const sellPrice = Number(p.price) || 0;

      totalStockUnits += qty;
      totalStockCost += (buyRate * qty);
      totalRetailValue += (sellPrice * qty);

      if (qty <= (p.minStockAlert || 5)) {
        lowStockCount++;
      }
    });

    const potentialProfit = Math.max(0, totalRetailValue - totalStockCost);

    return {
      totalProducts: vendorProducts.length,
      totalStockUnits,
      totalStockCost,
      totalRetailValue,
      potentialProfit,
      lowStockCount
    };
  }, [vendorProducts]);

  // Save Supplier Profile Changes
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplier) return;
    setIsSaving(true);
    try {
      const payload = {
        name: editForm.name,
        nickname: editForm.nickname,
        phone: editForm.contact,
        address: editForm.address,
        gstNo: editForm.gst,
        vendorInvoice: editForm.vendorInvoice,
      };

      await vendorService.patch(`/vendors/update/${supplier.id}`, payload);
      toast.success('Supplier details updated!');
      await refreshVendors();
      setIsEditModalOpen(false);
      fetchSupplierData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update supplier.');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-600"></div>
          <p className="text-gray-500 font-bold animate-pulse">Loading Supplier Profile...</p>
        </div>
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="p-8 text-center h-[80vh] flex flex-col items-center justify-center">
        <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="text-gray-300" size={64} />
        </div>
        <h2 className="text-2xl font-black text-gray-800">SUPPLIER NOT FOUND</h2>
        <p className="text-gray-500 mb-8 max-w-sm">The salon supplier you are looking for does not exist or has been removed.</p>
        <button
          onClick={() => navigate('/admin/suppliers')}
          className="px-8 py-3 bg-gray-900 text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all"
        >
          <ArrowLeft size={20} /> Back to Suppliers
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/suppliers')}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500"
            title="Back to Suppliers"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <span className="bg-gradient-to-br from-pink-600 to-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-pink-200">
                <Building2 size={26} />
              </span>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                {supplier.name}
                <SyncIndicator isSyncing={isSyncing} className="ml-1" />
              </h1>
            </div>
            <div className="text-gray-500 font-medium ml-14 mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-bold">
                ID: {supplier.id}
              </span>
              {supplier.nickname && (
                <span className="bg-pink-50 text-pink-700 px-2 py-0.5 rounded font-semibold border border-pink-100">
                  Code: {supplier.nickname}
                </span>
              )}
              <span className="text-gray-400">• Salon Product Supplier</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => { fetchSupplierData(); refreshProducts(); }}
            className="p-2 text-gray-400 hover:text-pink-600 hover:bg-pink-50 rounded-xl transition-all border border-gray-200"
            title="Refresh Data"
          >
            <RefreshCw size={18} />
          </button>

          <button
            onClick={() => setIsEditModalOpen(true)}
            className="px-4 py-2 border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center gap-2 text-sm transition-all"
          >
            <Pencil size={16} /> Edit Profile
          </button>

          <button
            onClick={() => navigate('/admin/products')}
            className="px-5 py-2.5 bg-gradient-to-r from-pink-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-pink-200 hover:from-pink-700 hover:to-indigo-700 flex items-center gap-2 text-sm transition-all"
          >
            <PlusCircle size={18} /> Add Salon Product
          </button>
        </div>
      </div>

      {/* Supplier Profile Information Card */}
      <div className="bg-white p-6 rounded-2xl border border-gray-200/80 shadow-sm grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-pink-50 text-pink-600 rounded-xl shrink-0">
            <Phone size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact Phone</div>
            <div className="text-sm font-bold text-gray-900 mt-0.5 font-mono">{supplier.phone || 'N/A'}</div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl shrink-0">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">GSTIN Number</div>
            <div className="text-sm font-mono font-bold text-gray-900 mt-0.5">{supplier.gstin || 'Unregistered'}</div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl shrink-0">
            <MapPin size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Address</div>
            <div className="text-sm font-semibold text-gray-900 mt-0.5 truncate max-w-[220px]" title={supplier.address || ''}>
              {supplier.address || 'N/A'}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl shrink-0">
            <FileText size={18} />
          </div>
          <div>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">Invoice Reference</div>
            <div className="text-sm font-bold text-gray-900 mt-0.5">{supplier.vendorInvoice || 'Standard'}</div>
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-pink-500">
          <div className="text-xs font-bold text-pink-600 uppercase tracking-wider">Products Supplied</div>
          <div className="text-3xl font-black text-gray-900 mt-1">{metrics.totalProducts}</div>
          <div className="text-xs text-gray-400 font-medium mt-1">Catalog items from this supplier</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-blue-500">
          <div className="text-xs font-bold text-blue-600 uppercase tracking-wider">Total Units In Stock</div>
          <div className="text-3xl font-black text-blue-600 mt-1">{metrics.totalStockUnits}</div>
          <div className="text-xs text-gray-400 font-medium mt-1">Available salon inventory</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-emerald-500">
          <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Stock Cost Value</div>
          <div className="text-3xl font-black text-emerald-600 mt-1">₹{metrics.totalStockCost.toLocaleString()}</div>
          <div className="text-xs text-gray-400 font-medium mt-1">Inventory investment (Buy rate)</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm border-t-4 border-t-amber-500">
          <div className="text-xs font-bold text-amber-600 uppercase tracking-wider">Low Stock Warnings</div>
          <div className="text-3xl font-black text-amber-600 mt-1">{metrics.lowStockCount}</div>
          <div className="text-xs text-gray-400 font-medium mt-1">
            {metrics.lowStockCount > 0 ? (
              <span className="text-amber-600 font-bold">Needs reorder soon</span>
            ) : (
              <span className="text-green-600 font-bold">Stock levels healthy</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden">
        {/* Tab Headers */}
        <div className="flex border-b border-gray-200 bg-gray-50/70 p-2 gap-2">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'products'
                ? 'bg-white text-pink-600 shadow-sm border border-gray-200/60'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
            }`}
          >
            <Package size={18} />
            <span>Supplied Products ({vendorProducts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all ${
              activeTab === 'transactions'
                ? 'bg-white text-pink-600 shadow-sm border border-gray-200/60'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100/60'
            }`}
          >
            <FileText size={18} />
            <span>Stock-In & Invoices ({transactions.length})</span>
          </button>
        </div>

        {/* Tab 1: Products Table */}
        {activeTab === 'products' && (
          <div className="p-6 space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search size={18} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by product name, barcode, ID..."
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    className="pl-9 pr-4 py-2 border rounded-xl text-sm w-full focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
                  />
                </div>
              </div>

              {availableCategories.length > 0 && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold text-gray-500">Category:</span>
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="border rounded-xl text-xs py-1.5 px-3 focus:outline-none focus:ring-2 focus:ring-pink-500/20 font-medium"
                  >
                    <option value="ALL">All Categories</option>
                    {availableCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500 border-b">
                  <tr>
                    <th className="p-3">S.No</th>
                    <th className="p-3">Image</th>
                    <th className="p-3">Barcode / ID</th>
                    <th className="p-3">Product Name</th>
                    <th className="p-3">Category</th>
                    <th className="p-3 text-right">Buy Rate (₹)</th>
                    <th className="p-3 text-right">Sell Price (₹)</th>
                    <th className="p-3 text-right">Margin</th>
                    <th className="p-3 text-right">Stock</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-10 text-center text-gray-400">
                        <Package className="mx-auto mb-2 text-gray-300" size={36} />
                        No salon products found for this supplier.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p, idx) => {
                      const buy = Number(p.purchaseRate) || 0;
                      const sell = Number(p.price) || 0;
                      const stock = Number(p.stockQuantity) || 0;
                      const marginPct = buy > 0 ? Math.round(((sell - buy) / buy) * 100) : 0;
                      const isLowStock = stock <= (p.minStockAlert || 5);
                      const isOutOfStock = stock <= 0;

                      return (
                        <tr key={p.id || idx} className="hover:bg-pink-50/30 transition-colors">
                          <td className="p-3 text-gray-500">{idx + 1}</td>
                          <td className="p-3">
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.name}
                                className="w-10 h-10 object-cover rounded-lg border cursor-zoom-in hover:opacity-80 transition-opacity"
                                onClick={() => setZoomedImage(p.imageUrl || null)}
                              />
                            ) : (
                              <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center text-[10px] text-gray-400">
                                None
                              </div>
                            )}
                          </td>
                          <td className="p-3 font-mono text-xs font-bold text-gray-700">{p.barcode || p.id}</td>
                          <td className="p-3 font-bold text-gray-900">{p.name}</td>
                          <td className="p-3 text-gray-600 text-xs font-medium">{p.category || 'General'}</td>
                          <td className="p-3 text-right font-medium text-gray-700">₹{buy.toFixed(2)}</td>
                          <td className="p-3 text-right font-extrabold text-pink-600">₹{sell.toFixed(2)}</td>
                          <td className="p-3 text-right text-xs font-bold">
                            <span className={marginPct >= 30 ? 'text-green-600' : 'text-gray-600'}>
                              {marginPct > 0 ? `+${marginPct}%` : `${marginPct}%`}
                            </span>
                          </td>
                          <td className="p-3 text-right font-black">
                            <span className={isOutOfStock ? 'text-red-600' : (isLowStock ? 'text-amber-600' : 'text-gray-800')}>
                              {stock}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {isOutOfStock ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">Out of Stock</span>
                            ) : isLowStock ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Low Stock</span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">In Stock</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Transactions / Invoices */}
        {activeTab === 'transactions' && (
          <div className="p-6 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500 border-b">
                  <tr>
                    <th className="p-3">Date</th>
                    <th className="p-3">Invoice / Ref #</th>
                    <th className="p-3 text-right">Amount (₹)</th>
                    <th className="p-3 text-right">Paid (₹)</th>
                    <th className="p-3 text-right">Balance (₹)</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-10 text-center text-gray-400">
                        <FileText className="mx-auto mb-2 text-gray-300" size={36} />
                        No stock-in or purchase invoices recorded for this supplier.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx, idx) => (
                      <tr key={tx.id || idx} className="hover:bg-pink-50/30 transition-colors">
                        <td className="p-3 text-gray-600 font-medium">
                          {tx.date || (tx.createdAt ? new Date(tx.createdAt).toLocaleDateString('en-IN') : '-')}
                        </td>
                        <td className="p-3 font-mono font-bold text-gray-800">{tx.invoice || '-'}</td>
                        <td className="p-3 text-right font-bold text-gray-900">₹{(tx.amount || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-green-600">₹{(tx.paidAmount || 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-bold text-red-600">₹{(tx.balance || 0).toLocaleString()}</td>
                        <td className="p-3 text-center">
                          <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            (tx.balance || 0) > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                          }`}>
                            {tx.status || ((tx.balance || 0) > 0 ? 'PENDING' : 'PAID')}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-gray-500">{tx.description || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit Supplier Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-lg animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
              <h2 className="text-xl font-bold text-gray-900">Edit Supplier Details</h2>
              <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSaveSupplier} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Supplier Name *</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-sm mt-1 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Nickname / Code</label>
                  <input
                    type="text"
                    value={editForm.nickname}
                    onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm mt-1 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Contact Phone</label>
                  <input
                    type="text"
                    value={editForm.contact}
                    onChange={(e) => setEditForm({ ...editForm, contact: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm mt-1 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">GSTIN Number</label>
                  <input
                    type="text"
                    value={editForm.gst}
                    onChange={(e) => setEditForm({ ...editForm, gst: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm mt-1 focus:ring-2 focus:ring-pink-500/20 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase">Invoice Reference</label>
                  <input
                    type="text"
                    value={editForm.vendorInvoice}
                    onChange={(e) => setEditForm({ ...editForm, vendorInvoice: e.target.value })}
                    className="w-full border rounded-xl p-2.5 text-sm mt-1 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Address</label>
                <textarea
                  rows={2}
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full border rounded-xl p-2.5 text-sm mt-1 focus:ring-2 focus:ring-pink-500/20 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-sm font-semibold hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl text-sm shadow-md shadow-pink-200 flex items-center gap-2"
                >
                  {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setZoomedImage(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh]">
            <img src={zoomedImage} alt="Product Zoom" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
            <button
              onClick={() => setZoomedImage(null)}
              className="absolute -top-3 -right-3 p-2 bg-white rounded-full shadow-lg text-gray-700 hover:text-black"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SupplierDetails;
