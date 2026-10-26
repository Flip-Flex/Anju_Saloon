import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, User, Scissors, Phone, Plus, X, Search, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { useGlobalData } from '@/context/GlobalDataContext';
import { appointmentApi, Appointment } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO, isSameDay, addDays, subDays } from 'date-fns';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';

const Appointments = () => {
  const { appointments, customers, salonServices, staff, refreshAppointments } = useGlobalData();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  
  // Modal Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Appointment>>({
    customerName: '',
    customerPhone: '',
    serviceIds: [],
    date: format(new Date(), 'yyyy-MM-dd'),
    time: '10:00',
    status: 'SCHEDULED',
    staffId: '',
    notes: ''
  });

  const filteredAppointments = useMemo(() => {
    return appointments
      .filter(apt => {
        // Filter by date
        const aptDate = apt.date ? parseISO(apt.date) : null;
        if (!aptDate || !isSameDay(aptDate, selectedDate)) return false;
        
        // Filter by search
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          return (
            apt.customerName.toLowerCase().includes(query) ||
            apt.customerPhone.includes(query)
          );
        }
        return true;
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [appointments, selectedDate, searchQuery]);

  const handleOpenModal = (apt?: Appointment) => {
    if (apt) {
      setEditingId(apt.id || null);
      setFormData({
        ...apt,
        serviceIds: apt.serviceIds || [],
      });
    } else {
      setEditingId(null);
      setFormData({
        customerName: '',
        customerPhone: '',
        serviceIds: [],
        date: format(selectedDate, 'yyyy-MM-dd'),
        time: '10:00',
        status: 'SCHEDULED',
        staffId: '',
        notes: ''
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.customerName || !formData.customerPhone || !formData.date || !formData.time || !formData.serviceIds?.length) {
      toast({ title: 'Validation Error', description: 'Please fill all required fields including at least one service.', variant: 'destructive' });
      return;
    }

    // Canonical calculations
    const selectedServices = salonServices.filter(s => formData.serviceIds?.includes(s.id!));
    const serviceNames = selectedServices.map(s => s.name);
    const serviceName = serviceNames.join(', ');
    const assignedStaff = staff.find(s => s.id === formData.staffId);
    const staffName = assignedStaff ? assignedStaff.name : '';

    // Calculate duration in minutes (sum of service durations or 30 mins each)
    const totalDuration = selectedServices.reduce((sum, s) => sum + (Number(s.duration) || 30), 0) || 30;

    // Calculate start & end times
    const startTime = formData.time;
    const [h, m] = startTime.split(':').map(Number);
    const startTotalMin = h * 60 + m;
    const endTotalMin = startTotalMin + totalDuration;
    const endH = Math.floor(endTotalMin / 60) % 24;
    const endM = endTotalMin % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    // Conflict detection: Check if assigned staff has overlapping appointment
    if (formData.staffId) {
      const conflict = appointments.find(a => {
        if (a.id === editingId) return false;
        if (a.date !== formData.date) return false;
        if (a.staffId !== formData.staffId) return false;
        if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') return false;

        const otherStart = a.startTime || a.time || '10:00';
        const [oh, om] = otherStart.split(':').map(Number);
        const otherStartMin = oh * 60 + om;
        const otherDur = Number(a.durationMinutes) || (a.serviceIds?.length ? a.serviceIds.length * 30 : 30);
        const otherEndMin = otherStartMin + otherDur;

        // Check time interval overlap
        return startTotalMin < otherEndMin && endTotalMin > otherStartMin;
      });

      if (conflict) {
        const proceed = window.confirm(
          `Staff Conflict Warning:\n${staffName || 'Staff'} already has an active appointment at ${conflict.startTime || conflict.time} with ${conflict.customerName}.\n\nDo you want to proceed anyway?`
        );
        if (!proceed) return;
      }
    }

    const payload: Partial<Appointment> = {
      ...formData,
      serviceNames,
      serviceName,
      staffName,
      startTime,
      endTime,
      durationMinutes: totalDuration
    };

    try {
      if (editingId) {
        await appointmentApi.update(editingId, { ...payload, updatedAt: new Date().toISOString() });
        toast({ title: 'Success', description: 'Appointment updated.' });
      } else {
        await appointmentApi.add({ ...payload, createdAt: new Date().toISOString() });
        toast({ title: 'Success', description: 'Appointment created.' });
      }
      await refreshAppointments();
      setIsModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save appointment.', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this appointment?")) return;
    try {
      await appointmentApi.delete(id);
      toast({ title: 'Success', description: 'Appointment deleted.' });
      await refreshAppointments();
    } catch (err: any) {
      toast({ title: 'Error', description: 'Failed to delete appointment.', variant: 'destructive' });
    }
  };

  const handleCreateBill = (apt: Appointment) => {
    const isAdmin = location.pathname.includes('/admin');
    const targetPath = isAdmin ? '/admin/billing' : '/cashier/billing';
    navigate(`${targetPath}?appointmentId=${apt.id}`, { state: { appointment: apt } });
  };

  const toggleService = (serviceId: string) => {
    const current = formData.serviceIds || [];
    if (current.includes(serviceId)) {
      setFormData({ ...formData, serviceIds: current.filter(id => id !== serviceId) });
    } else {
      setFormData({ ...formData, serviceIds: [...current, serviceId] });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'COMPLETED': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'CANCELLED': return 'bg-red-100 text-red-700 border-red-200';
      case 'NO_SHOW': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Appointments</h1>
          <p className="text-sm text-slate-500">Manage bookings and schedules</p>
        </div>
        <button 
          onClick={() => handleOpenModal()}
          className="bg-blue-600 text-white px-3 py-1.5 text-sm rounded-lg hover:bg-blue-700 transition flex items-center gap-2"
        >
          <Plus size={18} /> New Appointment
        </button>
      </div>

      <div className="flex gap-6 flex-1 overflow-hidden">
        {/* Sidebar Date Picker & Filters */}
        <div className="w-64 flex flex-col gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2"><CalendarIcon size={18}/> Date</h3>
            <div className="flex flex-col gap-2">
              <button onClick={() => setSelectedDate(new Date())} className={`px-3 py-1.5 text-sm rounded-lg text-sm text-left transition ${isSameDay(selectedDate, new Date()) ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}>Today</button>
              <button onClick={() => setSelectedDate(addDays(new Date(), 1))} className={`px-3 py-1.5 text-sm rounded-lg text-sm text-left transition ${isSameDay(selectedDate, addDays(new Date(), 1)) ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-slate-50 text-slate-600'}`}>Tomorrow</button>
              <hr className="my-2 border-slate-100" />
              <input 
                type="date" 
                value={format(selectedDate, 'yyyy-MM-dd')}
                onChange={(e) => {
                  if (e.target.value) setSelectedDate(parseISO(e.target.value));
                }}
                className="w-full border border-slate-200 rounded-lg p-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-semibold text-base text-slate-800">
              {isSameDay(selectedDate, new Date()) ? "Today's Schedule" : format(selectedDate, 'EEEE, MMM do yyyy')}
            </h2>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search customer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredAppointments.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400">
                <CalendarIcon size={48} className="mb-4 opacity-20" />
                <p>No appointments found for this date.</p>
              </div>
            ) : (
              filteredAppointments.map(apt => (
                <div key={apt.id} className="border border-slate-100 rounded-xl p-4 hover:shadow-md transition bg-white flex justify-between items-start group">
                  <div className="flex gap-4">
                    <div className="bg-slate-50 rounded-lg p-3 text-center min-w-[80px] border border-slate-100">
                      <p className="text-xl font-bold text-slate-800">{apt.time}</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-800 text-base flex items-center gap-2">
                        {apt.customerName}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(apt.status)}`}>
                          {apt.status}
                        </span>
                      </h3>
                      <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                        <span className="flex items-center gap-1"><Phone size={14}/> {apt.customerPhone}</span>
                        {apt.staffId && (
                          <span className="flex items-center gap-1">
                            <User size={14}/> 
                            {staff.find(s => s.id === apt.staffId)?.name || 'Unknown Staff'}
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {apt.serviceIds.map(sid => {
                          const svc = salonServices.find(s => s.id === sid);
                          return svc ? (
                            <span key={sid} className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded border border-blue-100 flex items-center gap-1">
                              <Scissors size={12}/> {svc.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                      {apt.notes && <p className="text-sm text-slate-500 mt-2 italic">"{apt.notes}"</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleCreateBill(apt)} title="Create Bill" className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"><ShoppingCart size={18}/></button>
                    <button onClick={() => handleOpenModal(apt)} title="Edit" className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"><Edit2 size={18}/></button>
                    <button onClick={() => handleDelete(apt.id!)} title="Delete" className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"><Trash2 size={18}/></button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Appointment Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => setIsModalOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h2 className="text-xl font-bold text-slate-800">
                  {editingId ? 'Edit Appointment' : 'New Appointment'}
                </h2>
                <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={24} />
                </button>
              </div>

              <form id="appointment-form" onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Customer Name *</label>
                    <input 
                      type="text" required
                      value={formData.customerName}
                      onChange={e => setFormData({...formData, customerName: e.target.value})}
                      className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Phone Number *</label>
                    <input 
                      type="text" required
                      value={formData.customerPhone}
                      onChange={e => setFormData({...formData, customerPhone: e.target.value})}
                      className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Date *</label>
                    <input 
                      type="date" required
                      value={formData.date}
                      onChange={e => setFormData({...formData, date: e.target.value})}
                      className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Time *</label>
                    <input 
                      type="time" required
                      value={formData.time}
                      onChange={e => setFormData({...formData, time: e.target.value})}
                      className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-slate-700">Status</label>
                    <select 
                      value={formData.status}
                      onChange={e => setFormData({...formData, status: e.target.value as any})}
                      className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="SCHEDULED">Scheduled</option>
                      <option value="COMPLETED">Completed</option>
                      <option value="CANCELLED">Cancelled</option>
                      <option value="NO_SHOW">No Show</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Services *</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-slate-50">
                    {salonServices.map(svc => (
                      <label key={svc.id} className={`flex items-center gap-2 p-2 rounded cursor-pointer border transition ${formData.serviceIds?.includes(svc.id!) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'}`}>
                        <input 
                          type="checkbox" 
                          className="hidden"
                          checked={formData.serviceIds?.includes(svc.id!)}
                          onChange={() => toggleService(svc.id!)}
                        />
                        <span className="text-sm font-medium">{svc.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Assign Staff (Optional)</label>
                  <select 
                    value={formData.staffId}
                    onChange={e => setFormData({...formData, staffId: e.target.value})}
                    className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="">-- No Preference --</option>
                    {staff.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">Notes</label>
                  <textarea 
                    rows={2}
                    value={formData.notes}
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    placeholder="Any special requests or details..."
                    className="w-full border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </form>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition font-medium">
                  Cancel
                </button>
                <button type="submit" form="appointment-form" className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium">
                  Save Appointment
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Appointments;
