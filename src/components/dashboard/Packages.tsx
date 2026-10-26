import React, { useState } from 'react';
import { useGlobalData } from '@/context/GlobalDataContext';
import { packageApi, SalonPackage, SalonService, PackageItem } from '@/lib/api';
import toast from 'react-hot-toast';
import { Search, Plus, Trash2, Gift, X, PlusCircle, MinusCircle } from 'lucide-react';
import { useConfirm } from '@/hooks/useConfirm';

export default function Packages() {
  const { packages, salonServices, refreshPackages } = useGlobalData();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<SalonPackage | null>(null);
  const { confirm, ConfirmationDialog } = useConfirm();

  const filteredPackages = packages.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.description || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (pkg: SalonPackage) => {
    setEditingPackage(pkg);
    setIsModalOpen(true);
  };

  const handleAddNew = () => {
    setEditingPackage(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    confirm("Are you sure you want to delete this package?", async () => {
      try {
        await packageApi.delete(id);
        toast.success("Package deleted");
        refreshPackages();
      } catch (err) {
        toast.error("Failed to delete package");
      }
    }, "Delete Package");
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Gift className="text-blue-500" />
            Salon Packages
          </h1>
          <p className="text-sm text-slate-500">Manage your salon packages & memberships</p>
        </div>
        <div className="flex gap-4 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="Search packages..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={handleAddNew}
            className="bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700 transition flex items-center gap-2 font-medium"
          >
            <Plus size={20} /> Add Package
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-600 text-sm">
              <tr>
                <th className="p-4 font-semibold border-b border-slate-200">Name</th>
                <th className="p-4 font-semibold border-b border-slate-200">Price</th>
                <th className="p-4 font-semibold border-b border-slate-200">Services Included</th>
                <th className="p-4 font-semibold border-b border-slate-200">Status</th>
                <th className="p-4 font-semibold border-b border-slate-200 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPackages.map(pkg => (
                <tr key={pkg.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => handleEdit(pkg)}>
                  <td className="p-4">
                    <div className="font-medium text-slate-800">{pkg.name}</div>
                    <div className="text-sm text-slate-500">{pkg.description}</div>
                  </td>
                  <td className="p-4 font-medium text-slate-800">₹{pkg.price}</td>
                  <td className="p-4 text-slate-600">
                    <div className="text-sm space-y-1">
                      {pkg.items && pkg.items.map((item, idx) => (
                        <div key={idx} className="flex gap-2 text-slate-600">
                          <span className="font-medium">{item.quantity}x</span>
                          <span>{item.serviceName || salonServices.find(s => s.id === item.serviceId)?.name || 'Unknown Service'}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${pkg.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                      {pkg.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => pkg.id && handleDelete(pkg.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredPackages.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500">
                    No packages found. Click "Add Package" to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <PackageModal 
          pkg={editingPackage} 
          services={salonServices} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={() => {
            setIsModalOpen(false);
            refreshPackages();
          }} 
        />
      )}
      <ConfirmationDialog />
    </div>
  );
}

function PackageModal({ pkg, services, onClose, onSuccess }: { pkg: SalonPackage | null, services: SalonService[], onClose: () => void, onSuccess: () => void }) {
  const [formData, setFormData] = useState<Partial<SalonPackage>>(
    pkg || { name: '', description: '', price: 0, isActive: true, items: [] }
  );
  const [loading, setLoading] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [selectedQuantity, setSelectedQuantity] = useState<number>(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((formData.items || []).length === 0) {
      toast.error("Please add at least one service to the package");
      return;
    }

    setLoading(true);
    try {
      if (pkg?.id) {
        await packageApi.update(pkg.id, formData);
        toast.success("Package updated");
      } else {
        await packageApi.add(formData);
        toast.success("Package added");
      }
      onSuccess();
    } catch (err) {
      toast.error("Operation failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAddService = () => {
    if (!selectedServiceId) return;
    const service = services.find(s => s.id === selectedServiceId);
    if (!service) return;

    const currentItems = formData.items || [];
    const existingIndex = currentItems.findIndex(i => i.serviceId === selectedServiceId);

    if (existingIndex >= 0) {
      const newItems = [...currentItems];
      newItems[existingIndex].quantity += selectedQuantity;
      setFormData({ ...formData, items: newItems });
    } else {
      setFormData({
        ...formData,
        items: [...currentItems, { serviceId: selectedServiceId, serviceName: service.name, quantity: selectedQuantity }]
      });
    }

    setSelectedServiceId('');
    setSelectedQuantity(1);
  };

  const handleRemoveService = (serviceId: string) => {
    const newItems = (formData.items || []).filter(i => i.serviceId !== serviceId);
    setFormData({ ...formData, items: newItems });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
          <h2 className="font-bold text-slate-800">{pkg ? 'Edit Package' : 'Add New Package'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={20} /></button>
        </div>
        <div className="p-4 overflow-y-auto">
          <form id="package-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Package Name</label>
                <input required type="text" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Total Package Price (₹)</label>
                <input required type="number" value={formData.price || 0} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea value={formData.description || ''} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500" rows={2} />
            </div>
            
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={formData.isActive !== false} onChange={e => setFormData({...formData, isActive: e.target.checked})} className="rounded text-blue-600" />
              <label htmlFor="isActive" className="text-sm text-slate-700 font-medium">Package is active and available for sale</label>
            </div>

            <div className="border-t border-slate-100 pt-4 mt-6">
              <h3 className="text-md font-semibold text-slate-800 mb-3">Included Services</h3>
              
              {/* Add Service Controls */}
              <div className="flex gap-2 items-end mb-4 bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Select Service</label>
                  <select 
                    value={selectedServiceId} 
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full p-2 text-sm border rounded-lg bg-white"
                  >
                    <option value="">-- Choose a service --</option>
                    {services.map(s => (
                      <option key={s.id} value={s.id}>{s.name} (₹{s.price})</option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Quantity</label>
                  <input 
                    type="number" 
                    min="1"
                    value={selectedQuantity}
                    onChange={(e) => setSelectedQuantity(Number(e.target.value))}
                    className="w-full p-2 text-sm border rounded-lg bg-white"
                  />
                </div>
                <button 
                  type="button" 
                  onClick={handleAddService}
                  disabled={!selectedServiceId || selectedQuantity < 1}
                  className="bg-slate-800 text-white p-2 rounded-lg hover:bg-slate-700 disabled:opacity-50 transition"
                >
                  <PlusCircle size={20} />
                </button>
              </div>

              {/* Service List */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-slate-600 border-b">
                    <tr>
                      <th className="p-2 font-medium">Service</th>
                      <th className="p-2 font-medium w-24 text-center">Quantity</th>
                      <th className="p-2 font-medium w-16 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(formData.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={3} className="p-4 text-center text-slate-500 italic">No services added yet.</td>
                      </tr>
                    ) : (
                      (formData.items || []).map((item, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="p-2 font-medium text-slate-800">
                            {item.serviceName || services.find(s => s.id === item.serviceId)?.name || 'Unknown'}
                          </td>
                          <td className="p-2 text-center text-slate-600">
                            <span className="bg-slate-100 px-2 py-1 rounded font-semibold">{item.quantity}</span>
                          </td>
                          <td className="p-2 text-right">
                            <button 
                              type="button"
                              onClick={() => handleRemoveService(item.serviceId)}
                              className="text-red-500 hover:bg-red-50 p-1 rounded transition"
                            >
                              <MinusCircle size={18} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </form>
        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" form="package-form" disabled={loading} className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Package'}
          </button>
        </div>
      </div>
    </div>
  );
}
