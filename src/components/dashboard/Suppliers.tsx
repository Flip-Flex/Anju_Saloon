import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Pencil, Trash2, PlusCircle, X, Upload, CreditCard, Loader2, Save, Eye } from 'lucide-react';
import { vendorService, Vendor } from '@/lib/api';
import { useGlobalData } from '@/context/GlobalDataContext';
import Papa from 'papaparse';

import { SyncIndicator } from '@/components/SyncIndicator';
import { useConfirm } from '@/hooks/useConfirm';

const Suppliers = () => {
  const navigate = useNavigate();
  const { vendors: suppliers, loading: globalLoading, refreshVendors: refreshSuppliers, isSyncing } = useGlobalData();
  const { confirm: confirmAction, ConfirmationDialog } = useConfirm();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Vendor | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false); // For CSV/local actions
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline Editing State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; nickname: string; contact: string; gst: string; address: string; customId: string; vendorInvoice: string }>({
    name: '', nickname: '', contact: '', gst: '', address: '', customId: '', vendorInvoice: ''
  });

  const handleEditClick = (s: Vendor) => {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      nickname: s.nickname || '',
      contact: s.phone || '',
      gst: s.gstin || '',
      address: s.address || '',
      customId: s.id || '',
      vendorInvoice: s.vendorInvoice || ''
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: '', nickname: '', contact: '', gst: '', address: '', customId: '', vendorInvoice: '' });
  };

  const handleSaveSupplier = async (supplier: Omit<Vendor, 'id'> & { id?: string; newId?: string; contact?: string; gst?: string; nickname?: string }) => {
    if (!supplier.id) {
      const isDuplicate = suppliers.some(
        s => s.name.trim().toLowerCase() === supplier.name.trim().toLowerCase()
      );
      if (isDuplicate) {
        toast.error(`Supplier "${supplier.name}" already exists.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const payload = {
        id: supplier.newId || supplier.id, // Try to set ID in body if allowed
        name: supplier.name,
        nickname: supplier.nickname,
        phone: supplier.contact,
        address: supplier.address,
        gstNo: supplier.gst,
        vendorInvoice: supplier.vendorInvoice,
      };

      if (supplier.id) {
        await vendorService.patch(`/vendors/update/${supplier.id}`, payload);
        toast.success('Supplier updated!');
      } else {
        await vendorService.post('/vendors/add', payload);
        toast.success('Supplier added!');
      }
      await refreshSuppliers();
      handleCloseModal();
      setEditingId(null); // Clear inline edit if applicable
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveInline = () => {
    if (!editingId) return;
    // Pass customId as id. Note: 'id' in handleSaveSupplier is used for the URL.
    handleSaveSupplier({ ...editForm, id: editingId, newId: editForm.customId } as any);
  };

  const handleDeleteSupplier = (id: string) => {
    confirmAction("Are you sure you want to delete this supplier?", async () => {
      setDeletingId(id);
      try {
        await vendorService.delete(`/vendors/delete/${id}`);
        toast.success('Deleted!');
        await refreshSuppliers();
      } catch (err: any) {
        toast.error(err.response?.data?.error || 'Delete failed.');
      } finally {
        setDeletingId(null);
      }
    }, "Delete Supplier");
  };

  // CSV Upload
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
        if (rows.length === 0) {
          toast.error('CSV is empty.');
          setLoading(false);
          return;
        }

        let success = 0, failed = 0;

        for (const row of rows) {
          const payload = {
            name: row.name?.trim(),
            phone: (row.contact || row.phone || '').trim(),
            address: (row.address || '').trim(),
            gstNo: (row.gst || row.gstin || '').trim(),
          };

          if (!payload.name) {
            failed++;
            continue;
          }

          try {
            await vendorService.post('/vendors/add', payload);
            success++;
          } catch (err) {
            failed++;
          }
        }

        toast.success(`${success} added, ${failed} failed.`);
        await refreshSuppliers();
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (err) => {
        toast.error('Parse error: ' + err.message);
        setLoading(false);
      }
    });
  };

  const handleOpenModal = (s: Vendor | null) => {
    setEditingSupplier(s); // Only used for Adding now, s will be null
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
  };


  const filteredSuppliers = suppliers.filter(s =>
    (s.name && String(s.name).toLowerCase().includes(searchTerm.toLowerCase())) ||
    (s.id && String(s.id).toLowerCase().includes(searchTerm.toLowerCase())) ||
    (s.phone && String(s.phone).includes(searchTerm))
  );

  return (
    <div className="space-y-6 p-6">
      <ConfirmationDialog />
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-800">Supplier Management</h1>
          <SyncIndicator isSyncing={isSyncing} />
        </div>
        <div className="flex gap-4">
          <button onClick={handleUploadClick} className="px-3 py-1.5 text-sm text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2">
            <Upload size={20} /> Upload CSV
          </button>
          <button onClick={() => handleOpenModal(null)} className="px-3 py-1.5 text-sm text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2">
            <PlusCircle size={20} /> Add Supplier
          </button>
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleFileUpload} />

      <div className="bg-white p-6 rounded-lg shadow-sm">
        <input
          type="text"
          placeholder="Search by Name, ID, or Contact..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full md:w-1/3 p-2 border rounded"
        />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {globalLoading && suppliers.length === 0 ? (
          <p className="p-6 text-gray-500">Loading...</p>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-4">S.No</th>
                <th className="p-4">Supplier Name</th>
                <th className="p-4">Nickname</th>
                <th className="p-4">Supplier ID</th>
                <th className="p-4">Contact No.</th>
                <th className="p-4">GST Number</th>
                <th className="p-4">Address</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.map((s, i) => {
                const isEditing = editingId === s.id;
                return (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="p-4">{i + 1}</td>

                    {isEditing ? (
                      <>
                        <td className="p-4"><input id={`edit-name-${s.id}`} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`edit-nickname-${s.id}`)?.focus(); } }} className="border rounded p-1 w-full" autoFocus /></td>
                        <td className="p-4"><input id={`edit-nickname-${s.id}`} value={editForm.nickname} onChange={e => setEditForm({ ...editForm, nickname: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`edit-contact-${s.id}`)?.focus(); } }} className="border rounded p-1 w-full" /></td>
                        <td className="p-4"><input value={editForm.customId} disabled className="border rounded p-1 w-full font-mono bg-gray-100 text-gray-500 cursor-not-allowed" placeholder="ID" /></td>
                        <td className="p-4"><input id={`edit-contact-${s.id}`} value={editForm.contact} onChange={e => setEditForm({ ...editForm, contact: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`edit-gst-${s.id}`)?.focus(); } }} className="border rounded p-1 w-full" /></td>
                        <td className="p-4"><input id={`edit-gst-${s.id}`} value={editForm.gst} onChange={e => setEditForm({ ...editForm, gst: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById(`edit-address-${s.id}`)?.focus(); } }} className="border rounded p-1 w-full" /></td>
                        <td className="p-4"><input id={`edit-address-${s.id}`} value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSaveInline(); } }} className="border rounded p-1 w-full" /></td>
                        <td className="p-4 flex gap-2">
                          <button onClick={handleSaveInline} disabled={isSaving} className="text-green-600 hover:text-green-800"><Save size={20} /></button>
                          <button onClick={handleCancelEdit} disabled={isSaving} className="text-red-500 hover:text-red-700"><X size={20} /></button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-4 font-medium">
                          <button
                            onClick={() => navigate(`/admin/suppliers/${s.id}`)}
                            className="text-pink-600 hover:text-pink-800 font-semibold hover:underline text-left inline-flex items-center gap-1.5 group"
                            title="View Supplier Details"
                          >
                            <span>{s.name}</span>
                          </button>
                        </td>
                        <td className="p-4 text-slate-500 italic">{s.nickname || '-'}</td>
                        <td className="p-4 font-mono">{s.id}</td>
                        <td className="p-4">{s.phone}</td>
                        <td className="p-4">{s.gstin}</td>
                        <td className="p-4">{s.address}</td>
                        <td className="p-4">
                          <button
                            onClick={() => navigate(`/admin/suppliers/${s.id}`)}
                            title="View Supplier Details"
                            className="text-pink-600 hover:text-pink-800 p-1 hover:bg-pink-50 rounded"
                          >
                            <Eye size={18} />
                          </button>

                          <button
                            onClick={() => handleEditClick(s)}
                            title="Edit Supplier"
                            className="text-blue-600 hover:text-blue-800 ml-2 p-1 hover:bg-blue-50 rounded"
                          >
                            <Pencil size={18} />
                          </button>

                          <button
                            onClick={() => handleDeleteSupplier(s.id)}
                            title="Delete Supplier"
                            disabled={deletingId === s.id}
                            className="text-red-600 hover:text-red-800 ml-2 p-1 hover:bg-red-50 rounded disabled:opacity-50"
                          >
                            {deletingId === s.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <SupplierFormModal supplier={editingSupplier} onSave={handleSaveSupplier} onClose={handleCloseModal} isSaving={isSaving} />
      )}


    </div>
  );
};

const SupplierFormModal = ({ supplier, onSave, onClose, isSaving }: { supplier: Vendor | null; onSave: any; onClose: () => void; isSaving?: boolean }) => {
  const [form, setForm] = useState({
    name: supplier?.name || '',
    nickname: supplier?.nickname || '',
    contact: supplier?.phone || '',
    gst: supplier?.gstin || '',
    vendorInvoice: supplier?.vendorInvoice || '',
    address: supplier?.address || '',
  });

  const nameRef = useRef<HTMLInputElement>(null);
  const nicknameRef = useRef<HTMLInputElement>(null);
  const contactRef = useRef<HTMLInputElement>(null);
  const gstRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onSave({ ...form, id: supplier?.id });
  };

  const handleEnter = (e: React.KeyboardEvent, nextRef: React.RefObject<any>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nextRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">{supplier ? 'Edit' : 'Add'} Supplier</h2>
          <button onClick={onClose}><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label>Supplier Name *</label>
            <input ref={nameRef} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => handleEnter(e, nicknameRef)} className="w-full p-2 border rounded mt-1" />
          </div>
          <div>
            <label>Nickname</label>
            <input ref={nicknameRef} value={form.nickname} onChange={e => setForm({ ...form, nickname: e.target.value })} onKeyDown={(e) => handleEnter(e, contactRef)} className="w-full p-2 border rounded mt-1" placeholder="Short name for barcode" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label>Contact</label>
              <input ref={contactRef} type="text" value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} onKeyDown={(e) => handleEnter(e, gstRef)} className="w-full p-2 border rounded mt-1" />
            </div>
            <div>
              <label>GST</label>
              <input ref={gstRef} value={form.gst} onChange={e => setForm({ ...form, gst: e.target.value })} onKeyDown={(e) => handleEnter(e, addressRef)} className="w-full p-2 border rounded mt-1" />
            </div>
          </div>

          <div>
            <label>Address</label>
            <input ref={addressRef} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmit(); } }} className="w-full p-2 border rounded mt-1" />
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-200 rounded">Cancel</button>
            <button type="submit" disabled={isSaving} className="px-5 py-2 bg-blue-600 text-white rounded disabled:opacity-50">{isSaving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Suppliers;
