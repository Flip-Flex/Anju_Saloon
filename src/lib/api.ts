import axios from 'axios';
import { auth } from '@/lib/firebase';

const isDev = import.meta.env.MODE === 'development';
const PRODUCT_SERVICE_URL = isDev ? '/proxy' : 'https://product-service-demo-551828258445.asia-southeast1.run.app/api';
const BILLING_SERVICE_URL = isDev ? '/proxy' : 'https://billing-service-demo-551828258445.asia-southeast1.run.app/api';
const VENDOR_SERVICE_URL = isDev ? '/proxy' : 'https://vendor-service-demo-551828258445.asia-southeast1.run.app/api';
const REPORT_SERVICE_URL = isDev ? '/proxy' : 'https://billing-service-demo-551828258445.asia-southeast1.run.app/api';
const STAFF_SERVICE_URL = isDev ? '/proxy' : 'https://staff-service-demo-551828258445.asia-southeast1.run.app/api';
import { db } from '@/lib/firebase';
import { collection, getDocs, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, where } from 'firebase/firestore';

// --- Create a separate Axios instance for each service ---
const productService = axios.create({ baseURL: PRODUCT_SERVICE_URL, timeout: 15000 });
const billingService = axios.create({ baseURL: BILLING_SERVICE_URL, timeout: 15000 });
const vendorService = axios.create({ baseURL: VENDOR_SERVICE_URL, timeout: 15000 });
const reportService = axios.create({ baseURL: REPORT_SERVICE_URL, timeout: 15000 });
const staffService = axios.create({ baseURL: STAFF_SERVICE_URL, timeout: 15000 });
const customerService = axios.create({ baseURL: VENDOR_SERVICE_URL, timeout: 15000 });
const appointmentService = axios.create({ baseURL: '/api', timeout: 15000 });

// Firestore adapter interceptor
const firestoreAdapter = async (config: any) => {
  const url = config.url || '';
  const method = (config.method || 'get').toLowerCase();
  
  // Return a mock response adapter
  const respond = (data: any, status: number = 200) => {
    config.adapter = async () => {
      const response = { data, status, statusText: status === 200 ? 'OK' : 'Error', headers: {}, config, request: {} };
      if (status >= 400) {
        const error: any = new Error(data?.error || 'Request failed');
        error.response = response;
        throw error;
      }
      return response;
    };
    return config;
  };
  // Helper to generate short 5-character alphanumeric ID
  const generateShortId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  // Helper to sanitize payload before saving to Firestore
  const sanitizeForFirestore = (obj: any): any => {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
    if (typeof File !== 'undefined' && obj instanceof File) return undefined;
    if (typeof Blob !== 'undefined' && obj instanceof Blob) return undefined;

    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val === undefined) continue;
      if (typeof File !== 'undefined' && val instanceof File) continue;
      if (typeof Blob !== 'undefined' && val instanceof Blob) continue;
      clean[key] = sanitizeForFirestore(val);
    }
    return clean;
  };

  try {
    if (url.includes('/products/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'products'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/products/') && url.includes('/image') && method === 'post') {
      const id = url.split('/products/')[1].split('/image')[0].replace(/\//g, '');
      let imageUrl = '';
      if (config.data instanceof FormData) {
        const file = config.data.get('file') as any;
        if (file && typeof file === 'object' && 'arrayBuffer' in file) {
          const buffer = await file.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          imageUrl = `data:${file.type || 'image/jpeg'};base64,${base64}`;
        }
      }
      if (id && imageUrl) {
        await updateDoc(doc(db, 'products', id), { imageUrl, updatedAt: new Date().toISOString() });
      }
      return respond({ success: true, imageUrl });
    }
    if (url.includes('/products/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const cleanData = sanitizeForFirestore(parsedData);
      const ref = await addDoc(collection(db, 'products'), cleanData);
      return respond({ id: ref.id, ...cleanData });
    }
    if (url.includes('/products/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const cleanData = sanitizeForFirestore(parsedData);
      if (id) await updateDoc(doc(db, 'products', id), cleanData);
      return respond({ id, ...cleanData });
    }
    if (url.includes('/products/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'products', id));
      return respond({ success: true });
    }
    if (url === '/products/categories' && method === 'get') {
      const snap = await getDocs(collection(db, 'categories'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/products/categories/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'categories'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/products/categories/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'categories', id));
      return respond({ success: true });
    }
    if (url.includes('/products/categories/') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'categories', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/products/barcode/') && method === 'get') {
      const barcode = url.split('/products/barcode/')[1];
      if (!barcode) return respond(null);
      const q = query(collection(db, 'products'), where('barcode', '==', decodeURIComponent(barcode)));
      const snap = await getDocs(q);
      if (snap.empty) return respond(null);
      return respond({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }

    // Settings
    if (url.includes('/settings/global') && method === 'get') {
      const snap = await getDocs(query(collection(db, 'settings'), where('__name__', '==', 'global')));
      if (snap.empty) {
        const defaultSettings = {
          shopName: 'Anjus Beauty Saloon',
          gstNumber: '33ADFPN7561FL1ZK',
          billMessage: 'Thank You For Your Purchasing',
          defaultGst: '0',
          loyaltyEnabled: false,
          loyaltySpendRatio: 100,
          loyaltyRedeemValue: 1
        };
        await setDoc(doc(db, 'settings', 'global'), defaultSettings);
        return respond(defaultSettings);
      }
      return respond(snap.docs[0].data());
    }
    if (url.includes('/settings/global') && method === 'patch') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      await setDoc(doc(db, 'settings', 'global'), parsedData, { merge: true });
      return respond(parsedData);
    }
    
    // Stock Transactions
    if (url.includes('/stock-transactions/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'stock_transactions'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/stock-transactions/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'stock_transactions'), { ...parsedData, createdAt: new Date().toISOString() });
      return respond({ id: ref.id, ...parsedData });
    }
    
    // Salon Services (Canonical collection: 'services')
    if (url.includes('/salon-services/all') && method === 'get') {
      let snap = await getDocs(collection(db, 'services'));
      if (snap.empty) {
        snap = await getDocs(collection(db, 'salon_services'));
      }
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/salon-services/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'services'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/salon-services/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'services', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/salon-services/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'services', id));
      return respond({ success: true });
    }
    if (url.includes('/salon-services/categories') && method === 'get') {
      let snap = await getDocs(collection(db, 'service_categories'));
      if (snap.empty) {
        snap = await getDocs(collection(db, 'salon_service_categories'));
      }
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }

    // Packages
    if (url.includes('/packages/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'packages'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/packages/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'packages'), { ...parsedData, createdAt: new Date().toISOString() });
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/packages/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'packages', id), { ...parsedData, updatedAt: new Date().toISOString() });
      return respond({ id, ...parsedData });
    }
    if (url.includes('/packages/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'packages', id));
      return respond({ success: true });
    }

    // Customers
    if (url.includes('/customers/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'customers'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/customers/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const cleanPhone = (parsedData.phone || '').toString().replace(/\D/g, '');

      // Check if customer already exists by phone (matching last 10 digits) or exact name
      if (cleanPhone.length >= 7) {
        const allCustSnap = await getDocs(collection(db, 'customers'));
        const existingDoc = allCustSnap.docs.find(d => {
          const cPhone = (d.data().phone || '').toString().replace(/\D/g, '');
          return cPhone === cleanPhone || (cPhone.length >= 10 && cleanPhone.length >= 10 && cPhone.slice(-10) === cleanPhone.slice(-10));
        });
        if (existingDoc) {
          await updateDoc(doc(db, 'customers', existingDoc.id), {
            ...parsedData,
            updatedAt: new Date().toISOString()
          });
          return respond({ id: existingDoc.id, ...existingDoc.data(), ...parsedData });
        }
      }

      const ref = await addDoc(collection(db, 'customers'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/customers/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'customers', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/customers/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'customers', id));
      return respond({ success: true });
    }

    // Billing
    if (url.includes('/billing/notifications') && method === 'get') {
      const snap = await getDocs(collection(db, 'bills'));
      const reminderBills = snap.docs
        .map(d => ({ ...d.data(), id: d.id }))
        .filter((b: any) => 
          b.enableExpiryReminder === true && 
          b.status !== 'CANCELLED' && 
          b.status !== 'REFUNDED' &&
          b.status !== 'HOLD'
        );
      return respond(reminderBills);
    }
    const mapBillDoc = (d: any) => {
      const data = d.data();
      const rawDate = data.createdAt ?? data.timestamp ?? data.date ?? data.billDate ?? data.updatedAt;
      let createdAt = '';
      if (rawDate && typeof rawDate === 'object') {
        const s = rawDate.seconds ?? rawDate._seconds;
        if (s !== undefined) createdAt = new Date(s * 1000).toISOString();
        else if (typeof rawDate.toDate === 'function') createdAt = rawDate.toDate().toISOString();
      } else if (typeof rawDate === 'number') {
        const ms = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
        createdAt = new Date(ms).toISOString();
      } else if (typeof rawDate === 'string' && rawDate.trim()) {
        const parsed = Date.parse(rawDate);
        createdAt = !isNaN(parsed) ? new Date(parsed).toISOString() : rawDate;
      }
      const finalAmt = Number(data.finalAmount ?? data.totalAmount ?? data.amountPaid ?? 0);
      return {
        ...data,
        id: d.id,
        createdAt,
        date: data.date || createdAt,
        totalAmount: Number(data.totalAmount ?? finalAmt),
        finalAmount: finalAmt,
        invoiceNumber: data.invoiceNumber || data.invoiceId || d.id
      };
    };

    if (url.includes('/billing/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'bills'));
      return respond(snap.docs.map(mapBillDoc));
    }
    if (url.includes('/billing/range') && method === 'get') {
      const snap = await getDocs(collection(db, 'bills'));
      return respond(snap.docs.map(mapBillDoc));
    }
    if (url.includes('/billing/search') && method === 'get') {
      const snap = await getDocs(collection(db, 'bills'));
      // Basic mock fallback
      return respond(snap.docs.map(mapBillDoc));
    }
    if (url.includes('/billing/hold') && method === 'get') {
      const snap = await getDocs(query(collection(db, 'bills'), where('status', '==', 'HOLD')));
      return respond(snap.docs.map(mapBillDoc));
    }
    if (url.includes('/billing/cancelled') && method === 'get') {
      const snap = await getDocs(query(collection(db, 'bills'), where('status', '==', 'CANCELLED')));
      return respond(snap.docs.map(mapBillDoc));
    }
    // Single bill GET
    if (url.includes('/billing/') && !url.includes('/update') && !url.includes('/pay') && !url.includes('/cancel') && !url.includes('/refund') && !url.includes('/notifications') && !url.includes('/all') && !url.includes('/create') && !url.includes('/search') && !url.includes('/range') && method === 'get') {
      const parts = url.split('?')[0].split('/');
      const id = parts[parts.indexOf('billing') + 1];
      if (id) {
        try {
          const docSnap = await getDoc(doc(db, 'bills', id));
          if (docSnap.exists()) {
            return respond(mapBillDoc(docSnap));
          }
        } catch (err) {
          console.warn('Direct getDoc failed, falling back to query:', err);
        }
        const snap = await getDocs(query(collection(db, 'bills'), where('__name__', '==', id)));
        if (!snap.empty) {
          return respond(mapBillDoc(snap.docs[0]));
        }
      }
      return respond(null, 404);
    }
    if (url.includes('/billing/') && method === 'delete') {
      const parts = url.split('?')[0].split('/');
      const id = parts[parts.indexOf('billing') + 1];
      if (id) {
        await deleteDoc(doc(db, 'bills', id));
        return respond({ success: true });
      }
    }
    if (url.includes('/billing/create') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      
      const nowIso = new Date().toISOString();
      parsedData.createdAt = parsedData.createdAt || nowIso;
      parsedData.date = parsedData.date || nowIso;
      parsedData.status = parsedData.status || 'PAID';
      parsedData.systemType = parsedData.systemType || 'Retail';
      const shortId = generateShortId();
      parsedData.invoiceId = shortId;
      parsedData.invoiceNumber = parsedData.invoiceNumber || parsedData.invoiceId || shortId;
      parsedData.totalAmount = Number(parsedData.totalAmount ?? parsedData.finalAmount ?? 0);
      parsedData.finalAmount = Number(parsedData.finalAmount ?? parsedData.totalAmount ?? 0);

      // Auto-link customerId if missing but phone matches an existing customer
      let linkedCustomerId = parsedData.customerId;
      const bPhoneClean = (parsedData.customerPhone || '').toString().replace(/\D/g, '');
      if (!linkedCustomerId && bPhoneClean.length >= 7) {
        const custSnap = await getDocs(collection(db, 'customers'));
        const match = custSnap.docs.find(d => {
          const cp = (d.data().phone || '').toString().replace(/\D/g, '');
          return cp === bPhoneClean || (cp.length >= 10 && bPhoneClean.length >= 10 && cp.slice(-10) === bPhoneClean.slice(-10));
        });
        if (match) {
          linkedCustomerId = match.id;
          parsedData.customerId = match.id;
        }
      }

      const ref = doc(db, 'bills', shortId);
      await setDoc(ref, parsedData);

      // Update customer stats (visit count, total spent, last visit) if linked
      if (linkedCustomerId) {
        try {
          const custRef = doc(db, 'customers', linkedCustomerId);
          const custDocSnap = await getDocs(query(collection(db, 'customers'), where('__name__', '==', linkedCustomerId)));
          if (!custDocSnap.empty) {
            const custData = custDocSnap.docs[0].data();
            const prevSpent = Number(custData.totalSpent) || 0;
            const prevPaid = Number(custData.totalPaid) || 0;
            const prevVisits = Number(custData.visitCount) || 0;
            const billTotal = Number(parsedData.finalAmount || parsedData.totalAmount) || 0;
            const billPaid = Number(parsedData.amountPaid) || (parsedData.status === 'PAID' ? billTotal : 0);

            const prevLoyalty = Number(custData.loyaltyPoints) || 0;
            const redeemedLoyalty = Number(parsedData.loyaltyPointsRedeemed) || 0;
            const earnedLoyalty = Number(parsedData.loyaltyPointsEarned) || 0;
            const updatedLoyalty = Math.max(0, prevLoyalty - redeemedLoyalty + earnedLoyalty);

            await updateDoc(custRef, {
              totalSpent: prevSpent + billTotal,
              totalPaid: prevPaid + billPaid,
              pendingBalance: Math.max(0, (prevSpent + billTotal) - (prevPaid + billPaid)),
              visitCount: prevVisits + 1,
              loyaltyPoints: updatedLoyalty,
              lastVisit: new Date().toISOString()
            });

            // Log loyalty transaction ledger entry
            if (earnedLoyalty > 0 || redeemedLoyalty > 0) {
              try {
                await addDoc(collection(db, 'loyalty_transactions'), {
                  customerId: linkedCustomerId,
                  billId: ref.id,
                  pointsEarned: earnedLoyalty,
                  pointsRedeemed: redeemedLoyalty,
                  resultingBalance: updatedLoyalty,
                  type: 'BILL',
                  createdAt: nowIso
                });
              } catch (ltErr) {
                console.warn("Failed to log loyalty transaction:", ltErr);
              }
            }
          }
        } catch (cErr) {
          console.error("Failed to update customer stats in /billing/create:", cErr);
        }
      }
      
      // Auto-deduct stock for products
      if (parsedData.status === 'PAID' && parsedData.items) {
        for (const item of parsedData.items) {
          const itemType = (item.type || '').toLowerCase();
          if (itemType !== 'service') {
            const productId = item.id || item.productId || item.barcode;
            if (productId) {
              const productRef = doc(db, 'products', productId);
              const productSnap = await getDocs(query(collection(db, 'products'), where('__name__', '==', productRef.id)));
              if (!productSnap.empty) {
                const productData = productSnap.docs[0].data();
                const previousStock = productData.stockQuantity || 0;
                const resultingStock = previousStock - (item.quantity || item.qty);
                
                await updateDoc(productRef, { stockQuantity: resultingStock });
                
                await addDoc(collection(db, 'stock_transactions'), {
                  productId: productRef.id,
                  productName: item.name || productData.name,
                  transactionType: 'SALE',
                  quantity: item.quantity || item.qty,
                  previousStock,
                  resultingStock,
                  reason: `Sale on Bill #${ref.id}`,
                  referenceType: 'BILL',
                  referenceId: ref.id,
                  createdAt: new Date().toISOString()
                });
              }
            }
          }
        }
      }

      // Record staff commissions in staff_commissions collection
      if (parsedData.status === 'PAID' && parsedData.items) {
        let itemsCommSum = 0;
        for (const item of parsedData.items) {
          const itemStaffId = item.staffId || parsedData.staffId;
          const commAmt = Number(item.staffCommissionAmount) || 0;
          if (commAmt > 0 && itemStaffId) {
            itemsCommSum += commAmt;
            try {
              await addDoc(collection(db, 'staff_commissions'), {
                staffId: itemStaffId,
                staffName: item.staffName || '',
                billId: ref.id,
                date: parsedData.createdAt,
                createdAt: parsedData.createdAt,
                amount: parsedData.finalAmount,
                commissionAmount: commAmt,
                staffCommissionAmount: commAmt,
                serviceId: item.serviceId || '',
                serviceName: item.productName || item.name || '',
                status: 'UNPAID'
              });
            } catch (scErr) {
              console.error("Failed to add item commission record:", scErr);
            }
          }
        }

        if (itemsCommSum === 0 && Number(parsedData.staffCommissionAmount) > 0 && parsedData.staffId) {
          try {
            await addDoc(collection(db, 'staff_commissions'), {
              staffId: parsedData.staffId,
              billId: ref.id,
              date: parsedData.createdAt,
              createdAt: parsedData.createdAt,
              amount: parsedData.finalAmount,
              commissionAmount: Number(parsedData.staffCommissionAmount),
              staffCommissionAmount: Number(parsedData.staffCommissionAmount),
              status: 'UNPAID'
            });
          } catch (scErr) {
            console.error("Failed to add bill-level commission record:", scErr);
          }
        }
      }

      return respond({ id: ref.id, ...parsedData });
    }
    // Record payment on an existing bill (due payment)
    if (url.includes('/billing/') && url.includes('/record-payment') && method === 'patch') {
      const parts = url.split('?')[0].split('/');
      const recordPaymentIdx = parts.indexOf('record-payment');
      const id = recordPaymentIdx > 0 ? parts[recordPaymentIdx - 1] : parts.slice(-2, -1)[0];
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const paymentAmount = Number(parsedData.amount) || 0;
      const paymentMode = parsedData.paymentMode || parsedData.mode || 'CASH';
      const description = parsedData.description || parsedData.remarks || '';

      if (paymentAmount <= 0) {
        return respond({ error: 'Invalid payment amount' }, 400);
      }

      if (!id) {
        return respond({ error: 'Bill ID missing' }, 400);
      }

      // Fetch the bill document from Firestore
      let billDocSnap: any = null;
      let billRef = doc(db, 'bills', id);
      try {
        const directSnap = await getDoc(billRef);
        if (directSnap.exists()) {
          billDocSnap = directSnap;
        }
      } catch (err) {
        console.warn('Direct getDoc failed in /record-payment, querying collection:', err);
      }

      if (!billDocSnap) {
        const snap = await getDocs(query(collection(db, 'bills'), where('__name__', '==', id)));
        if (!snap.empty) {
          billDocSnap = snap.docs[0];
          billRef = billDocSnap.ref;
        } else {
          const snap2 = await getDocs(query(collection(db, 'bills'), where('invoiceNumber', '==', id)));
          if (!snap2.empty) {
            billDocSnap = snap2.docs[0];
            billRef = billDocSnap.ref;
          } else {
            const snap3 = await getDocs(query(collection(db, 'bills'), where('id', '==', id)));
            if (!snap3.empty) {
              billDocSnap = snap3.docs[0];
              billRef = billDocSnap.ref;
            }
          }
        }
      }

      if (!billDocSnap || !billDocSnap.exists()) {
        return respond({ error: 'Bill not found' }, 404);
      }

      const billData = billDocSnap.data();
      const nowIso = new Date().toISOString();
      const totalAmount = Number(billData.finalAmount ?? billData.totalAmount ?? 0);
      const prevAmountPaid = Number(billData.amountPaid ?? (billData.status === 'PAID' ? totalAmount : 0));
      const newAmountPaid = prevAmountPaid + paymentAmount;
      const newBalance = Math.max(0, totalAmount - newAmountPaid);
      const newStatus = newBalance <= 0.01 ? 'PAID' : 'PARTIAL';

      const paymentRecord = {
        amount: paymentAmount,
        paymentMode,
        description: description || '',
        paymentDate: nowIso,
        balanceAfterPayment: newBalance,
        statusAfterPayment: newStatus
      };

      const existingHistory = Array.isArray(billData.paymentHistory) ? billData.paymentHistory : [];
      const updatedHistory = [...existingHistory, paymentRecord];

      const billUpdatePayload: any = {
        amountPaid: newAmountPaid,
        balance: newBalance,
        pendingBalance: newBalance,
        pendingAmount: newBalance,
        status: newStatus,
        paymentHistory: updatedHistory,
        updatedAt: nowIso
      };

      if (billData.paymentMethod === 'PENDING' || billData.paymentMethod === 'CREDIT') {
        billUpdatePayload.paymentMethod = paymentMode;
      }

      await updateDoc(billRef, billUpdatePayload);

      // Synchronize customer totalPaid and pendingBalance
      let customerId = billData.customerId || billData.customer_id;
      if (!customerId && billData.customerPhone) {
        const bPhoneClean = billData.customerPhone.toString().replace(/\D/g, '');
        if (bPhoneClean.length >= 7) {
          try {
            const custSnap = await getDocs(collection(db, 'customers'));
            const matchCust = custSnap.docs.find(d => {
              const cp = (d.data().phone || '').toString().replace(/\D/g, '');
              return cp === bPhoneClean || (cp.length >= 10 && bPhoneClean.length >= 10 && cp.slice(-10) === bPhoneClean.slice(-10));
            });
            if (matchCust) customerId = matchCust.id;
          } catch (cErr) {
            console.warn("Failed customer phone lookup in /record-payment:", cErr);
          }
        }
      }

      if (customerId) {
        try {
          const custRef = doc(db, 'customers', customerId);
          const custSnap = await getDoc(custRef);
          if (custSnap.exists()) {
            const custData = custSnap.data();
            const prevCustPaid = Number(custData.totalPaid) || 0;
            const prevCustSpent = Number(custData.totalSpent) || 0;
            const updatedCustPaid = prevCustPaid + paymentAmount;
            const updatedCustPending = Math.max(0, prevCustSpent - updatedCustPaid);

            await updateDoc(custRef, {
              totalPaid: updatedCustPaid,
              pendingBalance: updatedCustPending,
              updatedAt: nowIso
            });
          }
        } catch (custUpdateErr) {
          console.error("Failed to update customer stats in /record-payment:", custUpdateErr);
        }
      }

      return respond({
        id: billRef.id,
        success: true,
        amountPaid: newAmountPaid,
        balance: newBalance,
        status: newStatus,
        paymentHistory: updatedHistory
      });
    }
    if (url.includes('/billing/') && (url.endsWith('/pay') || url.includes('/pay?')) && method === 'patch') {
      const id = url.split('/').slice(-2, -1)[0];
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const nowIso = new Date().toISOString();
      parsedData.updatedAt = nowIso;
      if (!parsedData.createdAt) parsedData.createdAt = nowIso;
      if (!parsedData.date) parsedData.date = nowIso;
      await updateDoc(doc(db, 'bills', id), { ...parsedData, status: 'PAID' });
      
      // Auto-deduct stock for products
      if (parsedData.items) {
        for (const item of parsedData.items) {
          const itemType = (item.type || '').toLowerCase();
          if (itemType !== 'service') {
            const productId = item.id || item.productId || item.barcode;
            if (productId) {
              const productRef = doc(db, 'products', productId);
              const productSnap = await getDocs(query(collection(db, 'products'), where('__name__', '==', productRef.id)));
              if (!productSnap.empty) {
                const productData = productSnap.docs[0].data();
                const previousStock = productData.stockQuantity || 0;
                const resultingStock = previousStock - (item.quantity || item.qty);
                
                await updateDoc(productRef, { stockQuantity: resultingStock });
                
                await addDoc(collection(db, 'stock_transactions'), {
                  productId: productRef.id,
                  productName: item.name || productData.name,
                  transactionType: 'SALE',
                  quantity: item.quantity || item.qty,
                  previousStock,
                  resultingStock,
                  reason: `Sale on Bill #${id} (Hold converted)`,
                  referenceType: 'BILL',
                  referenceId: id,
                  createdAt: new Date().toISOString()
                });
              }
            }
          }
        }

        // Record staff commissions on payment if applicable
        for (const item of parsedData.items) {
          const itemStaffId = item.staffId || parsedData.staffId;
          const commAmt = Number(item.staffCommissionAmount) || 0;
          if (commAmt > 0 && itemStaffId) {
            try {
              await addDoc(collection(db, 'staff_commissions'), {
                staffId: itemStaffId,
                staffName: item.staffName || '',
                billId: id,
                date: nowIso,
                createdAt: nowIso,
                amount: parsedData.finalAmount,
                commissionAmount: commAmt,
                staffCommissionAmount: commAmt,
                serviceId: item.serviceId || '',
                serviceName: item.productName || item.name || '',
                status: 'UNPAID'
              });
            } catch (scErr) {
              console.error("Failed to add commission on pay:", scErr);
            }
          }
        }
      }

      return respond({ id, ...parsedData, status: 'PAID' });
    }
    if (url.includes('/billing/hold') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const shortId = generateShortId();
      const holdData = { ...parsedData, status: 'HOLD', invoiceId: shortId };
      const ref = doc(db, 'bills', shortId);
      await setDoc(ref, holdData);
      return respond({ id: ref.id, ...holdData });
    }
    if (url.includes('/billing/update/') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'bills', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/billing/') && (url.includes('/cancel') || url.includes('/refund')) && (method === 'put' || method === 'patch' || method === 'post')) {
      const parts = url.split('?')[0].split('/');
      // Extract ID: it's the segment right after 'billing' and before 'cancel'/'refund'
      const billingIdx = parts.indexOf('billing');
      const id = billingIdx >= 0 && billingIdx + 1 < parts.length ? parts[billingIdx + 1] : undefined;
      const action = url.includes('/cancel') ? 'CANCELLED' : 'REFUNDED';
      
      if (id) {
        const billRef = doc(db, 'bills', id);
        const billSnap = await getDocs(query(collection(db, 'bills'), where('__name__', '==', id)));
        if (!billSnap.empty) {
          const billData = billSnap.docs[0].data();
          if (billData.status === 'CANCELLED' || billData.status === 'REFUNDED') {
             return respond({ error: "Bill is already cancelled or refunded" }, 400);
          }
          
          await updateDoc(billRef, { status: action, updatedAt: new Date().toISOString() });
          
          // Revert stock for products
          if (billData.items) {
            for (const item of billData.items) {
              const itemType = (item.type || '').toLowerCase();
              if (itemType !== 'service') {
                const productId = item.id || item.productId || item.barcode;
                if (productId) {
                  const productRef = doc(db, 'products', productId);
                  const productSnap = await getDocs(query(collection(db, 'products'), where('__name__', '==', productId)));
                  if (!productSnap.empty) {
                    const productData = productSnap.docs[0].data();
                    const previousStock = productData.stockQuantity || 0;
                    const resultingStock = previousStock + (item.quantity || item.qty || 1);
                    
                    await updateDoc(productRef, { stockQuantity: resultingStock });
                    
                    await addDoc(collection(db, 'stock_transactions'), {
                      productId: productRef.id,
                      productName: item.name || productData.name || item.productName,
                      transactionType: action === 'CANCELLED' ? 'CORRECTION' : 'ADJUSTMENT',
                      quantity: item.quantity || item.qty || 1,
                      previousStock,
                      resultingStock,
                      reason: `${action === 'CANCELLED' ? 'Cancellation' : 'Refund'} of Bill #${id}`,
                      referenceType: 'BILL',
                      referenceId: id,
                      createdAt: new Date().toISOString()
                    });
                  }
                }
              }
            }
          }
          
          // Revert Staff Commissions
          const commSnap = await getDocs(query(collection(db, 'staff_commissions'), where('billId', '==', id)));
          for (const commDoc of commSnap.docs) {
             await updateDoc(commDoc.ref, { status: action });
          }

          // Revert Customer Stats (totalSpent, totalPaid, visitCount)
          const linkedCustomerId = billData.customerId;
          if (linkedCustomerId) {
            try {
              const custDocSnap = await getDocs(query(collection(db, 'customers'), where('__name__', '==', linkedCustomerId)));
              if (!custDocSnap.empty) {
                const custData = custDocSnap.docs[0].data();
                const billTotal = Number(billData.finalAmount || billData.totalAmount) || 0;
                const billPaid = Number(billData.amountPaid) || (billData.status === 'PAID' ? billTotal : 0);
                const prevSpent = Number(custData.totalSpent) || 0;
                const prevPaid = Number(custData.totalPaid) || 0;
                const prevVisits = Number(custData.visitCount) || 0;

                const earnedPoints = Number(billData.loyaltyPointsEarned) || 0;
                const redeemedPoints = Number(billData.loyaltyPointsRedeemed) || 0;
                const prevLoyalty = Number(custData.loyaltyPoints) || 0;
                const newLoyalty = Math.max(0, prevLoyalty - earnedPoints + redeemedPoints);

                await updateDoc(doc(db, 'customers', linkedCustomerId), {
                  totalSpent: Math.max(0, prevSpent - billTotal),
                  totalPaid: Math.max(0, prevPaid - billPaid),
                  pendingBalance: Math.max(0, (prevSpent - billTotal) - (prevPaid - billPaid)),
                  visitCount: Math.max(0, prevVisits - 1),
                  loyaltyPoints: newLoyalty
                });

                // Record loyalty reversal in ledger
                if (earnedPoints > 0 || redeemedPoints > 0) {
                  await addDoc(collection(db, 'loyalty_transactions'), {
                    customerId: linkedCustomerId,
                    billId: id,
                    type: 'LOYALTY_REVERSAL',
                    pointsEarnedReversed: earnedPoints,
                    pointsRedeemedRestored: redeemedPoints,
                    netPointsChange: redeemedPoints - earnedPoints,
                    reason: `${action === 'CANCELLED' ? 'Cancellation' : 'Refund'} of Bill #${id}`,
                    createdAt: new Date().toISOString()
                  });
                }
              }
            } catch (cErr) {
              console.error("Failed to revert customer stats on refund/cancel:", cErr);
            }
          }
        }
      }
      return respond({ id, status: action });
    }

    // Staff
    if (url.includes('/staff/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'staff'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/staff/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'staff'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    
    // Attendance
    if (url.includes('/staff/attendance/staff/') && method === 'get') {
      const parts = url.split('/');
      const yearMonth = parts.pop()!;
      const staffId = parts.pop()!;
      const snap = await getDocs(collection(db, 'attendance'));
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      results = results.filter((a: any) => a.staffId === staffId && a.date && a.date.startsWith(yearMonth));
      return respond(results);
    }

    // Salary Slip Computation
    if (url.includes('/staff/salary/') && method === 'get') {
      const parts = url.split('/');
      const yearMonth = parts.pop()!;
      const staffId = parts.pop()!;
      
      const staffSnap = await getDocs(query(collection(db, 'staff'), where('__name__', '==', staffId)));
      if (staffSnap.empty) return respond({ error: 'Staff not found' }, 404);
      const staffData = staffSnap.docs[0].data();
      
      const attSnap = await getDocs(collection(db, 'attendance'));
      let attendances = attSnap.docs.map(d => d.data()).filter((a: any) => a.staffId === staffId && a.date && a.date.startsWith(yearMonth));
      
      let presentDays = 0, absentDays = 0, halfDays = 0, sickLeaves = 0, permissionHoursTaken = 0;
      
      attendances.forEach((a: any) => {
         const status = a.status || a.type;
         if (status === 'PRESENT' || status === 'FULL_DAY') presentDays++;
         else if (status === 'ABSENT') absentDays++;
         else if (status === 'HALF_DAY') halfDays++;
         else if (status === 'LEAVE' || status === 'SICK') sickLeaves++;
         else if (status === 'PERMISSION') {
            presentDays++;
         }
      });
      
      const baseSalary = staffData.baseSalary || 0;
      const totalDays = new Date(parseInt(yearMonth.split('-')[0]), parseInt(yearMonth.split('-')[1]), 0).getDate();
      const perDaySalary = baseSalary / totalDays; 
      const perHourSalary = perDaySalary / 9; // Assuming 9 hrs
      
      const lopAmount = (absentDays * perDaySalary) + (halfDays * (perDaySalary / 2));
      
      const slip = {
         staffId,
         staffName: staffData.name,
         month: yearMonth,
         baseSalary,
         totalDays,
         presentDays,
         absentDays,
         halfDays,
         sickLeaves,
         permissionHoursTaken: 0,
         perDaySalary,
         perHourSalary,
         lopAmount,
         permissionDeduction: 0,
         netSalary: baseSalary - lopAmount
      };
      
      return respond(slip);
    }

    // Commissions
    if (url.includes('/staff/commissions/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'staff_commissions'));
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const urlObj = new URL('http://localhost' + url);
      const yearMonth = urlObj.searchParams.get('yearMonth');
      if (yearMonth) {
        results = results.filter((c: any) => c.date && c.date.startsWith(yearMonth));
      }
      return respond(results);
    }
    if (url.includes('/staff/commissions/') && method === 'get' && !url.includes('/all')) {
      // /staff/commissions/:staffId
      const parts = url.split('?')[0].split('/');
      const staffId = parts[parts.length - 1];
      const snap = await getDocs(collection(db, 'staff_commissions'));
      let results = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((c: any) => c.staffId === staffId);
      const urlObj = new URL('http://localhost' + url);
      const yearMonth = urlObj.searchParams.get('yearMonth');
      if (yearMonth) {
        results = results.filter((c: any) => c.date && c.date.startsWith(yearMonth));
      }
      return respond(results);
    }
    if (url.includes('/staff/commissions') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'staff_commissions'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/staff/commissions/') && url.includes('/pay') && method === 'patch') {
      const urlObj = new URL('http://localhost' + url);
      const paymentMethod = urlObj.searchParams.get('paymentMethod') || 'CASH';
      const parts = url.split('?')[0].split('/');
      // /staff/commissions/:id/pay
      const id = parts[parts.length - 2];
      await updateDoc(doc(db, 'staff_commissions', id), {
        status: 'PAID',
        paidDate: new Date().toISOString(),
        paymentMethod: paymentMethod,
        updatedAt: new Date().toISOString()
      });
      return respond({ id, status: 'PAID', paidDate: new Date().toISOString(), paymentMethod });
    }
    
    // Appointments
    if (url.includes('/appointments/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'appointments'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/appointments/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'appointments'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/appointments/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'appointments', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/appointments/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'appointments', id));
      return respond({ success: true });
    }

    // Customers (Get)
    if (url.includes('/customers/get/') && method === 'get') {
      const id = url.split('/').pop();
      if (!id) return respond(null);
      const snap = await getDocs(query(collection(db, 'customers'), where('__name__', '==', id)));
      if (snap.empty) return respond(null, 404);
      return respond({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }

    // Vendors
    if (url.includes('/vendors/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'vendors'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/vendors/get/') && method === 'get') {
      const id = url.split('/').pop();
      if (!id) return respond(null);
      const snap = await getDocs(query(collection(db, 'vendors'), where('__name__', '==', id)));
      if (snap.empty) return respond(null, 404);
      return respond({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }
    if (url.includes('/vendors/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'vendors'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/vendors/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'vendors', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/vendors/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'vendors', id));
      return respond({ success: true });
    }

    // Vendor Transactions
    if (url.includes('/vendors/transactions/vendor/') && method === 'get') {
      const vendorId = url.split('/').pop();
      const snap = await getDocs(query(collection(db, 'vendor_transactions'), where('vendorId', '==', vendorId)));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/vendors/transactions/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'vendor_transactions'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/vendors/transactions/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'vendor_transactions', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/vendors/transactions/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'vendor_transactions', id));
      return respond({ success: true });
    }
    if (url.includes('/vendors/transactions/') && url.includes('/pay') && (method === 'put' || method === 'patch')) {
      const parts = url.split('?')[0].split('/');
      const id = parts[parts.indexOf('transactions') + 1];
      // simplified mock response
      if (id) await updateDoc(doc(db, 'vendor_transactions', id), { status: 'PAID' });
      return respond({ id, status: 'PAID' });
    }
    if (url.includes('/vendors/transactions/range') && method === 'get') {
      const snap = await getDocs(collection(db, 'vendor_transactions'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }

    // Daybook
    if (url.includes('/billing/daybook/tally') && method === 'get') {
       const urlObj = new URL('http://localhost' + url);
       const date = urlObj.searchParams.get('date');
       const snap = await getDocs(query(collection(db, 'cash_tally'), where('date', '==', date)));
       if (snap.empty) return respond(null, 404);
       return respond({ id: snap.docs[0].id, ...snap.docs[0].data() });
    }
    if (url.includes('/billing/daybook/tally') && method === 'post') {
       const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
       const snap = await getDocs(query(collection(db, 'cash_tally'), where('date', '==', parsedData.date)));
       if (!snap.empty) {
         await updateDoc(doc(db, 'cash_tally', snap.docs[0].id), parsedData);
         return respond({ id: snap.docs[0].id, ...parsedData });
       }
       const ref = await addDoc(collection(db, 'cash_tally'), parsedData);
       return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/billing/daybook/summary') && method === 'get') {
      const snap = await getDocs(collection(db, 'daybook'));
      const entries = snap.docs.map(d => ({ ...d.data(), id: d.id }));
      const summary = {
        salesSummary: { total: 0, cash: 0, upi: 0, card: 0 },
        entries
      };
      return respond(summary);
    }
    if (url.includes('/billing/daybook/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'daybook'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/billing/daybook/update') && method === 'patch') {
      const id = url.split('/').pop();
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'daybook', id), parsedData);
      return respond({ id, ...parsedData });
    }
    if (url.includes('/billing/daybook/delete') && method === 'delete') {
      const id = url.split('/').pop();
      if (id) await deleteDoc(doc(db, 'daybook', id));
      return respond({ success: true });
    }
    if (url.includes('/billing/daybook/range') && method === 'get') {
       const snap = await getDocs(collection(db, 'daybook'));
       const entries = snap.docs.map(d => ({ ...d.data(), id: d.id }));
       return respond({ summary: { totalIncome: 0, totalExpense: 0 }, dailyBreakdown: [], chartData: [], entries });
    }

    // Estimations
    if (url.includes('/estimations/all') && method === 'get') {
      const snap = await getDocs(collection(db, 'estimations'));
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/estimations/create') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const shortId = generateShortId();
      parsedData.estimationId = shortId;
      const ref = doc(db, 'estimations', shortId);
      await setDoc(ref, parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/estimations/') && method === 'put') {
      const parts = url.split('?')[0].split('/');
      const id = parts[parts.indexOf('estimations') + 1];
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      if (id) await updateDoc(doc(db, 'estimations', id), parsedData);
      return respond({ id, ...parsedData });
    }

    // Customer Packages
    if (url.includes('/customer-packages/customer/') && method === 'get') {
      const customerId = url.split('/').pop();
      const q = query(collection(db, 'customer_packages'), where('customerId', '==', customerId));
      const snap = await getDocs(q);
      return respond(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    }
    if (url.includes('/customer-packages/add') && method === 'post') {
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const ref = await addDoc(collection(db, 'customer_packages'), parsedData);
      return respond({ id: ref.id, ...parsedData });
    }
    if (url.includes('/customer-packages/use/') && method === 'patch') {
      const id = url.split('/use/')[1]?.split('?')[0];
      const parsedData = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
      const { serviceId } = parsedData;
      const qtyToUse = Math.max(1, Number(parsedData.qty) || 1);

      if (!id) return respond({ error: 'Package ID missing' }, 400);

      const pkgRef = doc(db, 'customer_packages', id);
      const pkgSnap = await getDoc(pkgRef);
      if (!pkgSnap.exists()) {
        return respond({ error: 'Customer package not found' }, 404);
      }

      const pkgData = pkgSnap.data();
      const items = Array.isArray(pkgData.items) ? [...pkgData.items] : [];
      const itemIndex = items.findIndex((it: any) => it.serviceId === serviceId);

      if (itemIndex === -1) {
        return respond({ error: 'Service not found in this package' }, 400);
      }

      const currentItem = items[itemIndex];
      const totalQty = Number(currentItem.totalQuantity) || 0;
      const currentUsed = Number(currentItem.usedQuantity) || 0;
      const remaining = totalQty - currentUsed;

      if (remaining < qtyToUse) {
        return respond({ error: `Cannot redeem: Only ${remaining} session(s) remaining` }, 400);
      }

      const newUsed = currentUsed + qtyToUse;
      items[itemIndex] = {
        ...currentItem,
        usedQuantity: newUsed
      };

      const allCompleted = items.every((it: any) => (Number(it.usedQuantity) || 0) >= (Number(it.totalQuantity) || 0));
      const nowIso = new Date().toISOString();

      const redemptionEntry = {
        serviceId,
        serviceName: currentItem.serviceName || 'Service',
        quantity: qtyToUse,
        redeemedAt: nowIso
      };

      const existingHistory = Array.isArray(pkgData.redemptionHistory) ? pkgData.redemptionHistory : [];
      const updatedHistory = [...existingHistory, redemptionEntry];

      await updateDoc(pkgRef, {
        items,
        isActive: !allCompleted,
        redemptionHistory: updatedHistory,
        updatedAt: nowIso
      });

      return respond({
        id,
        success: true,
        items,
        isActive: !allCompleted,
        redemptionHistory: updatedHistory
      });
    }

    // Default fallback for unmapped endpoints to prevent crashes
    return respond([]);
  } catch (e) {
    console.error("Firestore adapter error", e);
    return Promise.reject(e);
  }
};

// Apply interceptors
productService.interceptors.request.use(firestoreAdapter);
billingService.interceptors.request.use(firestoreAdapter);
vendorService.interceptors.request.use(firestoreAdapter);
reportService.interceptors.request.use(firestoreAdapter);
staffService.interceptors.request.use(firestoreAdapter);
customerService.interceptors.request.use(firestoreAdapter);
appointmentService.interceptors.request.use(firestoreAdapter);

export {
  productService,
  billingService,
  vendorService,
  reportService,
  customerService,
  staffService,
  appointmentService,
};

// --- Types ---

export interface Appointment {
  id?: string;
  customerId?: string;
  customerName: string;
  customerPhone: string;
  serviceIds: string[];
  serviceNames?: string[];
  serviceName?: string;
  staffId?: string;
  staffName?: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  startTime?: string;
  endTime?: string;
  durationMinutes?: number;
  status: 'SCHEDULED' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
  notes?: string;
  billId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Staff {
  id: string;
  name: string;
  email?: string;
  phone: string;
  emergencyPhone?: string;
  role: string;
  hasLoginAccount?: boolean;
  authUid?: string;
  isActive: boolean; // Added for compatibility
  createdAt?: string;
  baseSalary?: number;
  allowedPermHours?: number;
  profilePicUrl?: string;
  accountNumber?: string;
  ifscCode?: string;
  commissionPercentage?: number;
}

export interface Role {
  id?: string;
  name: string;
  permissions?: string[];
  description?: string;
}

export interface Attendance {
  id?: string;
  staffId: string;
  staffName: string;
  date: string;
  status: 'PRESENT' | 'ABSENT' | 'HALF_DAY' | 'LEAVE' | 'PERMISSION' | 'FULL_DAY';
  remarks?: string; // Added for compatibility
  permissionTime?: string;
  permissionTimeRange?: string; // New field
  timestamp?: string; // Added for compatibility
  inTime?: string;
  outTime?: string;
}

// --- Staff API ---
export const staffApi = {
  // Staff Management
  getAll: async () => {
    const res = await staffService.get<Staff[]>('/staff/all');
    if (Array.isArray(res.data)) {
      res.data = res.data.map((s: any) => ({
        ...s,
        id: s.id || s._id || '',
        isActive: s.isActive !== undefined ? s.isActive : (s.active !== undefined ? s.active : true)
      }));
    }
    return res;
  },
  getById: async (id: string) => {
    const res = await staffService.get<Staff>(`/staff/${id}`);
    if (res.data) {
      const s: any = res.data;
      res.data = {
        ...s,
        id: s.id || s._id || '',
        isActive: s.isActive !== undefined ? s.isActive : (s.active !== undefined ? s.active : true)
      };
    }
    return res;
  },
  add: (data: Partial<Staff>) => {
    const payload = { ...data, active: data.isActive };
    return staffService.post('/staff/add', payload);
  },
  update: (id: string, data: Partial<Staff>) => {
    const payload = { ...data, active: data.isActive };
    return staffService.patch(`/staff/${id}`, payload);
  },
  delete: (id: string) => staffService.delete(`/staff/${id}`),

  // Role Management
  getRoles: () => staffService.get<Role[]>('/staff/roles'),
  addRole: (role: Role) => staffService.post('/staff/roles', role),
  updateRole: (id: string, role: Role) => staffService.put(`/staff/roles/${id}`, role),
  deleteRole: (id: string) => staffService.delete(`/staff/roles/${id}`),

  // Attendance Management
  getDailyAttendance: (date: string) => staffService.get<any>(`/staff/attendance/day/${date}`),

  markAttendance: (data: Attendance) => {
    const payload = { ...data, type: data.status }; // Map status -> type for backend DTO
    return staffService.post('/staff/attendance/mark', payload);
  },

  markBulkAttendance: (data: Attendance[]) => {
    const payload = data.map(d => ({ ...d, type: d.status })); // Map status -> type for bulk
    return staffService.post('/staff/attendance/mark-bulk', payload);
  },

  getMonthAttendance: (year: string, month: string) => staffService.get<any[]>(`/staff/attendance/month/${year}/${month}`),
  getStaffMonthAttendance: (staffId: string, yearMonth: string) => staffService.get<any>(`/staff/attendance/staff/${staffId}/${yearMonth}`),

  // Salary
  getSalarySlip: (staffId: string, yearMonth: string) => staffService.get<SalarySlip>(`/staff/salary/${staffId}/${yearMonth}`),

  // Commissions
  getAllCommissions: (yearMonth?: string) => staffService.get<Commission[]>(`/staff/commissions/all${yearMonth ? `?yearMonth=${yearMonth}` : ''}`),
  getStaffCommissions: (staffId: string, yearMonth?: string) =>
    staffService.get<Commission[]>(`/staff/commissions/${staffId}${yearMonth ? `?yearMonth=${yearMonth}` : ''}`),
  payCommission: (id: string, paymentMethod?: string) => staffService.patch(`/staff/commissions/${id}/pay${paymentMethod ? `?paymentMethod=${paymentMethod}` : ''}`),
  addCommission: (data: any) => staffService.post('/staff/commissions', data),
};

export interface SalarySlip {
  staffId: string;
  staffName: string;
  month: string;            // Format: "YYYY-MM"
  baseSalary: number;       // Monthly Fixed Salary

  // Attendance Stats
  totalDays: number;
  presentDays: number;      // Full Days + Permission Days
  absentDays: number;
  halfDays: number;
  sickLeaves: number;       // Paid leaves
  permissionHoursTaken: number;

  // Calculations
  perDaySalary: number;
  perHourSalary: number;

  // Financials
  lopAmount: number;        // Deduction for Absent + Half Days
  permissionDeduction: number; // Deduction for excess hours
  netSalary: number;        // Final Amount to be paid
}

export interface CreditTransaction {
  id?: string;
  vendorId?: string;
  invoice?: string; // Added for compatibility with new backend
  amount: number;
  paidAmount: number;
  balance: number;
  paymentMode: 'CASH' | 'ONLINE' | 'CHEQUE' | 'CREDIT' | 'UPI';
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  description?: string;
  date?: string;
  createdAt?: string;
  products?: Product[]; // Added list of products
  lastPaymentDate?: string;
  paymentRemarks?: string;
  paymentHistory?: PaymentHistoryEntry[];
}

export interface PaymentHistoryEntry {
  amount: number;
  paymentMode: string;
  description?: string;
  paymentDate: string;
  balanceAfterPayment: number;
  statusAfterPayment: string;
}

export interface Vendor {
  id: string;
  name: string;
  nickname?: string;
  phone: string;
  gstin: string;
  address: string;
  vendorInvoice?: string; // New field
  transactions?: string[];
}

export const mapVendorFromBackend = (v: any): Vendor => ({
  id: v.id || v._id || '',
  name: v.name,
  nickname: v.nickname || '',
  phone: v.phone || v.contact || '',
  gstin: v.gstin || v.gstIn || v.gst || v.GST || v.GSTIN || v.gstNo || '',
  address: v.address || '',
  vendorInvoice: v.vendorInvoice || '', // Map new field
  transactions: v.transactions || []
});

// Vendor API Wrapper
export const vendorApi = {
  getAll: async () => {
    const res = await vendorService.get<Vendor[]>('/vendors/all');
    let data: any[] = [];
    if (Array.isArray(res.data)) {
      data = res.data;
    } else if (res.data && Array.isArray((res.data as any).vendors)) {
      data = (res.data as any).vendors;
    }

    // In-place update of data to ensure type safety downstream
    const mapped = data.map(mapVendorFromBackend);
    res.data = mapped;
    return res;
  },
  getVendor: (id: string) => vendorService.get<Vendor>(`/vendors/get/${id}`),
  addVendor: (data: Partial<Vendor>) => vendorService.post('/vendors/add', data),
  updateVendor: (id: string, data: Partial<Vendor>) => vendorService.patch(`/vendors/update/${id}`, data),
  deleteVendor: (id: string) => vendorService.delete(`/vendors/delete/${id}`),

  // Transactions
  getCredits: (vendorId: string) => vendorService.get<CreditTransaction[]>(`/vendors/transactions/vendor/${vendorId}`),
  addCredit: (data: CreditTransaction) => vendorService.post('/vendors/transactions/add', data),
  updateCredit: (id: string, data: Partial<CreditTransaction>) => vendorService.patch(`/vendors/transactions/update/${id}`, data), // Kept for compat if needed, simplified in new backend
  recordPayment: (id: string, amount: number, paymentMode?: string, description?: string) =>
    vendorService.put(`/vendors/transactions/${id}/pay`, null, { params: { amount, paymentMode, paymentDescription: description } }),
  deleteCredit: (id: string) => vendorService.delete(`/vendors/transactions/delete/${id}`),
  getCreditsRange: (start: string, end: string) => vendorService.get<CreditTransaction[]>(`/vendors/transactions/range?startDate=${start}&endDate=${end}`),
  syncProductDetails: (productId: string, rate: number, gst: number, stock: number, syncStock?: boolean) => vendorService.put(`/vendors/transactions/sync-details/${productId}?rate=${rate}&gst=${gst}&stock=${stock}&syncStock=${syncStock !== false}`),
};



// --- Product API ---

export interface Category {
  id?: string;
  name: string;
}

export interface Product {
  id: string;
  name: string;
  brand?: string;
  category: string;
  subcategory?: string;
  sku?: string;
  purchaseRate: number;
  purchaseGst?: number;
  purchaseDisc?: number;
  sellingPrice: number;
  price: number;
  discount: number;
  stockQuantity: number | null;
  vendorId: string;
  vendorName: string;
  barcode: string;
  barcodeImageUrl?: string;
  purchaseDate?: string;
  createdAt?: string;
  updatedAt?: string;
  dateAdded?: string;
  mrp?: number;
  creditTransactionId?: string;
  billNo?: string;
  imageUrl?: string;
  availabilityStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'DISCONTINUED';
  active?: boolean;
  inventoryTracking: 'NOT_TRACKED' | 'TRACKED';
  reorderLevel?: number | null;
  batchNumber?: string;
  expiryDate?: string;
  unit?: string;
  vendorNickname?: string;
  series?: any;
  hashtagNumber?: string | number;
  systemType?: string;
}

// Helper to map Backend Product to Frontend Product (handling alias)
const mapProductFromBackend = (p: any): Product | null => {
  if (!p) return null;
  const hasTrackedStock = p.stockQuantity !== null && p.stockQuantity !== undefined && p.stockQuantity !== '';
  const tracking = p.inventoryTracking === 'NOT_TRACKED' ? 'NOT_TRACKED' : (p.inventoryTracking || (hasTrackedStock ? 'TRACKED' : 'NOT_TRACKED'));
  
  const parsedPrice = parseFloat((p.sellingPrice != null && Number(p.sellingPrice) > 0) ? p.sellingPrice : (p.price != null && Number(p.price) > 0 ? p.price : 0)) || 0;

  return {
    ...p,
    id: p.id || p._id || '',
    name: p.name || p.productName || '',
    brand: p.brand || '',
    category: p.category || '',
    subcategory: p.subcategory || '',
    sku: p.sku || '',
    billNo: p.billNo || p.billno || p.bill_number || p.invoiceNo || p.invoice_no || '',
    barcode: p.barcode || p.productCode || p.id || '', 
    purchaseDate: p.purchaseDate || p.createdAt || '',
    price: parsedPrice,
    sellingPrice: parsedPrice,
    mrp: parseFloat(p.mrp || p.MRP || p.Mrp || 0) || 0,
    purchaseRate: parseFloat(p.purchaseRate || 0) || 0,
    stockQuantity: tracking === 'NOT_TRACKED' ? null : (parseInt(p.stockQuantity || 0, 10) || 0),
    discount: parseFloat(p.discount || 0) || 0,
    purchaseGst: Number(p.purchaseGst) || 0,
    purchaseDisc: Number(p.purchaseDisc) || 0,
    availabilityStatus: p.availabilityStatus || 'AVAILABLE',
    active: p.active !== undefined ? Boolean(p.active) : true,
    inventoryTracking: tracking,
    reorderLevel: p.reorderLevel ? parseInt(p.reorderLevel, 10) : null,
    batchNumber: p.batchNumber || '',
    expiryDate: p.expiryDate || '',
    unit: p.unit || '',
    vendorId: p.vendorId || '',
    vendorName: p.vendorName || '',
    imageUrl: p.imageUrl || '',
  };
};

// Helper to map Frontend Product to Backend Product
const mapProductToBackend = (p: Partial<Product>): any => {
  const { price, sellingPrice, stockQuantity, inventoryTracking, dateAdded, createdAt, ...rest } = p;
  
  const finalPrice = parseFloat((sellingPrice != null && Number(sellingPrice) > 0) ? sellingPrice as any : (price != null && Number(price) > 0 ? price as any : 0)) || 0;

  const hasTrackedStock = stockQuantity !== null && stockQuantity !== undefined && (stockQuantity as any) !== '';
  const finalTracking = inventoryTracking === 'NOT_TRACKED' ? 'NOT_TRACKED' : (inventoryTracking || (hasTrackedStock ? 'TRACKED' : 'NOT_TRACKED'));
  const finalStock = finalTracking === 'NOT_TRACKED' ? null : (parseInt(stockQuantity as any || 0, 10) || 0);

  // Use dateAdded if provided (from Add Multiple UI), otherwise use existing createdAt (from CSV/Update), otherwise today.
  const finalCreatedAt = dateAdded 
    ? new Date(dateAdded).toISOString() 
    : (createdAt ? new Date(createdAt).toISOString() : new Date().toISOString());

  // Make sure imageFile or non-serializable objects aren't passed to Firestore
  const { imageFile, ...cleanRest } = rest as any;

  return {
    ...cleanRest,
    price: finalPrice,
    sellingPrice: finalPrice,
    stockQuantity: finalStock,
    inventoryTracking: finalTracking,
    createdAt: finalCreatedAt,
    purchaseDate: dateAdded || (cleanRest.purchaseDate || undefined),
    availabilityStatus: cleanRest.availabilityStatus || 'AVAILABLE',
    active: cleanRest.active !== undefined ? Boolean(cleanRest.active) : true,
  };
};

export const productApi = {
  getAll: async (params?: any) => {
    const res = await productService.get<Product[]>('/products/all', { params });
    if (Array.isArray(res.data)) {
      res.data = res.data.map(mapProductFromBackend);
    }
    return res;
  },
  get: async (id: string) => {
    const res = await productService.get<Product>(`/products/get/${id}`);
    if (res.data) res.data = mapProductFromBackend(res.data);
    return res;
  },
  getByBarcode: async (barcode: string) => {
    const res = await productService.get<Product>(`/products/barcode/${barcode}`);
    if (res.data) res.data = mapProductFromBackend(res.data);
    return res;
  },
  add: (data: Partial<Product>) => productService.post('/products/add', mapProductToBackend(data)),
  update: (id: string, data: Partial<Product>) => productService.patch(`/products/update/${id}`, mapProductToBackend(data)),
  delete: (id: string) => productService.delete(`/products/delete/${id}`),
  updateStock: (id: string, change: number | null, set: number | null) =>
    productService.put(`/products/${id}/stock`, null, { params: { change, set } }),
  uploadImage: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return productService.post(`/products/${id}/image`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  deleteImage: (id: string) => productService.delete(`/products/${id}/image`),

  // Categories
  getCategories: () => productService.get<Category[]>('/products/categories'),
  addCategory: (data: Category) => productService.post('/products/categories/add', data),
  updateCategory: (id: string, data: Partial<Category>) => productService.patch(`/products/categories/${id}`, data),
  deleteCategory: (id: string) => productService.delete(`/products/categories/delete/${id}`),

  // Date Range
  getByDateRange: async (startDate: string, endDate: string) => {
    const res = await productService.get<Product[]>(`/products/by-dates?startDate=${startDate}&endDate=${endDate}`);
    if (Array.isArray(res.data)) res.data = res.data.map(mapProductFromBackend);
    return res;
  }
};

// --- Salon Service API ---

export interface SalonServiceCategory {
  id?: string;
  name: string;
}

export interface SalonService {
  id: string;
  name: string;
  categoryId: string;
  description?: string;
  price: number;
  duration?: number; // duration in minutes
  active: boolean;
  commissionType?: 'PERCENTAGE' | 'FIXED';
  commissionValue?: number;
  eligibleStaffIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

const mapSalonServiceFromBackend = (s: any): SalonService => {
  return {
    ...s,
    id: s.id || s._id || '',
    name: s.name || '',
    categoryId: s.categoryId || '',
    price: parseFloat(s.price || 0) || 0,
    active: s.active !== undefined ? s.active : true,
    duration: parseInt(s.duration || 0) || 0,
    commissionType: s.commissionType || 'PERCENTAGE',
    commissionValue: parseFloat(s.commissionValue || 0) || 0,
    eligibleStaffIds: Array.isArray(s.eligibleStaffIds) ? s.eligibleStaffIds : [],
  };
};

export const salonServiceApi = {
  getAll: async () => {
    const res = await productService.get<SalonService[]>('/salon-services/all');
    if (Array.isArray(res.data)) {
      res.data = res.data.map(mapSalonServiceFromBackend);
    }
    return res;
  },
  get: async (id: string) => {
    const res = await productService.get<SalonService>(`/salon-services/get/${id}`);
    if (res.data) res.data = mapSalonServiceFromBackend(res.data);
    return res;
  },
  add: (data: Partial<SalonService>) => productService.post('/salon-services/add', data),
  update: (id: string, data: Partial<SalonService>) => productService.patch(`/salon-services/update/${id}`, data),
  delete: (id: string) => productService.delete(`/salon-services/delete/${id}`),

  // Categories
  getCategories: () => productService.get<SalonServiceCategory[]>('/salon-services/categories'),
  addCategory: (data: SalonServiceCategory) => productService.post('/salon-services/categories/add', data),
  updateCategory: (id: string, data: Partial<SalonServiceCategory>) => productService.patch(`/salon-services/categories/${id}`, data),
  deleteCategory: (id: string) => productService.delete(`/salon-services/categories/delete/${id}`),
};


// --- Billing API ---

export interface BillDetails {
  type?: 'PRODUCT' | 'SERVICE';
  productId?: string;
  serviceId?: string;
  staffId?: string;
  staffName?: string;
  quantity: number;
  qty?: number;
  productName: string; // Used for both product and service names backward compatible
  name?: string;
  serviceName?: string;
  unitPrice: number;
  price?: number;
  total?: number;
  staffCommissionAmount?: number;
  gstRate: number;
  discountRate: number;
  subtotal?: number;
  discountAmount?: number;
  gstAmount?: number;
  netAmount?: number;
  gstPercent?: number;
  purchaseRate?: number;
  purchaseGstRate?: number;
  baseAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  finalAmount?: number;
  imageUrl?: string;
  sku?: string;
  barcode?: string;
}

export interface Bill {
  id?: string;
  invoiceId?: string;
  invoiceNumber?: string;
  date?: string;
  estimationId?: string;
  totalAmount?: number;
  status?: string; 
  customerId?: string; 
  customerName: string;
  customerPhone: number;
  customerEmail?: string;
  customerAddress?: string;
  customerGst?: string; 
  cashierId?: string;
  items: BillDetails[];
  totalDiscountAmount?: number;
  totalGstAmount?: number;
  finalAmount?: number;
  amountPaid?: number;
  pendingAmount?: number;
  paymentMethod: string;
  paymentHistory?: PaymentHistoryEntry[];
  billType?: string; 
  staffId?: string; 
  staffCommissionPercentage?: number; 
  staffCommissionAmount?: number; 
  staffCommissionStatus?: 'PAID' | 'UNPAID'; 
  cashAmount?: number;
  onlineAmount?: number;
  createdAt?: string;
  updatedAt?: string;
  enableExpiryReminder?: boolean;
  expiryDays?: number;
}

export const billingApi = {
  create: async (data: Bill) => {
    // Route through billingService which has the Firestore adapter interceptor
    // This handles bill creation, stock deduction, and stock transaction logging
    const response = await billingService.post('/billing/create', data);
    return response;
  },
  update: (id: string, data: Partial<Bill>) => billingService.patch(`/billing/update/${id}`, data), // Added generic update
  hold: (data: Bill) => billingService.post('/billing/hold', data),

  cancelHold: (id: string) => billingService.put(`/billing/${id}/cancel`),
  cancelBill: (id: string) => billingService.put(`/billing/${id}/cancel`),
  refundBill: (id: string) => billingService.put(`/billing/${id}/refund`),
  returnBill: (id: string, data: Bill) => billingService.put(`/billing/${id}/return`, data),
  pay: (id: string, data: any) => billingService.patch(`/billing/${id}/pay`, data),
  recordPayment: (id: string, amount: number, paymentMode: string, description?: string) =>
    billingService.patch(`/billing/${id}/record-payment`, { amount, paymentMode, description }),
  getAll: () => billingService.get<Bill[]>('/billing/all'),
  getByRange: (start: string, end: string) => billingService.get<Bill[]>(`/billing/range?start=${start}&end=${end}&startDate=${start}&endDate=${end}`),
  search: (name?: string, phone?: number) => billingService.get<Bill[]>(`/billing/search`, { params: { name, phone } }),
  // Get single bill by ID
  getById: (id: string) => billingService.get<Bill>(`/billing/${encodeURIComponent(id)}`),
  delete: (id: string) => billingService.delete(`/billing/${id}`),
  // Compatibility
  getProduct: (barcode: string) => billingService.get<BillDetails>(`/billing/product/${barcode}`),
  getHoldBills: () => billingService.get<Bill[]>('/billing/hold'),
  getCancelledBills: () => billingService.get<Bill[]>('/billing/cancelled'),
  getNotifications: () => billingService.get<Bill[]>('/billing/notifications'),
};

// --- Customer API ---

export interface Customer {
  id: string;
  phone: string;
  name: string;
  email?: string;
  address?: string;
  gstin?: string;
  dob?: string;
  anniversary?: string;
  preferredStaff?: string;
  notes?: string;
  loyaltyPoints?: number;
  totalSpent?: number;
  totalPaid?: number; // Added totalPaid
  pendingBalance?: number; // Added pendingBalance
  visitCount?: number;
  lastVisit?: string;
  createdAt?: string;
}

export interface Viewer {
  id: string;
  name: string;
  nickname?: string;
  phone: string;
  state: string;
  creditAmount: number;
  totalPaidAmount: number;
  pendingBalance: number;
  createdAt?: string;
}





export interface CustomerPurchase {
  id: string;
  date: string;
  amount: number;
  paidAmount?: number; // Added paidAmount
  balance?: number;    // Added balance
  paymentMethod: string;
  items?: any[];
  status?: string;
  cashAmount?: number;
  onlineAmount?: number;
  paymentHistory?: PaymentHistoryEntry[]; // Added paymentHistory
}

export const mapCustomerFromBackend = (c: any): Customer => ({
  ...c,
  id: c.id || c._id || '',
  phone: c.phone || c.contact || '',
  address: c.address || c.Address || c.location || '',
  gstin: c.gstin || c.gst || c.gstNo || '',
  dob: c.dob || '',
  anniversary: c.anniversary || '',
  preferredStaff: c.preferredStaff || '',
  notes: c.notes || '',
  loyaltyPoints: c.loyaltyPoints || 0,
});

export const mapViewerFromBackend = (v: any): Viewer => ({
  ...v,
  id: v.id || v._id || '',
  phone: v.phone || v.contact || '',
  nickname: v.nickname || '',
  state: v.state || '',
  creditAmount: Number(v.creditAmount) || 0,
  totalPaidAmount: Number(v.totalPaidAmount) || 0,
  pendingBalance: Number(v.pendingBalance) || 0,
});

export const customerApi = {
  add: (data: Partial<Customer>) => customerService.post('/customers/add', data),
  getById: async (id: string) => {
    const res = await customerService.get<Customer>(`/customers/get/${id}`);
    if (res.data) {
      res.data = mapCustomerFromBackend(res.data);
    }
    return res;
  },
  getAll: async () => {
    const res = await customerService.get<Customer[]>('/customers/all');
    if (res.data && Array.isArray(res.data)) {
      res.data = res.data.map(mapCustomerFromBackend);
    }
    return res;
  },
  update: (id: string, data: Partial<Customer>) => customerService.patch(`/customers/update/${id}`, data),
  delete: (id: string) => customerService.delete(`/customers/delete/${id}`),
  getHistory: async (id: string) => {
    // Fallback implementation if no direct endpoint exists
    return billingService.get('/billing/history/customer/' + id).catch(() => ({ data: [] }));
  }
};





// --- DayBook API ---

export interface DayBookEntry {
  id?: string;
  type: "INCOME" | "EXPENSE";
  description: string;
  amount: number;
  date?: string;
  category?: string; // "System" means it came from auto-calculated sales
  paymentMethod: "Cash" | "UPI" | "Card";
}

export interface DayBookSummaryResponse {
  salesSummary: {
    total: number;
    cash: number;
    upi: number;
    card: number;
  };
  entries: DayBookEntry[];
}

export interface CashTally {
  id?: string;
  date: string; // YYYY-MM-DD
  openingBalance: number;
  expectedCash?: number;
  totalCashHand: number;
  difference?: number;
  denominations: { [key: string]: number }; // e.g., "500": 10
  closedAt?: string;
  closedBy?: string;
  isClosed?: boolean;
}

export const daybookApi = {
  getSummary: (date?: string, startDate?: string, endDate?: string) => {
    let url = '/billing/daybook/summary';
    const params = new URLSearchParams();
    if (date) params.append('date', date);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (params.toString()) url += `?${params.toString()}`;
    return billingService.get<DayBookSummaryResponse>(url);
  },
  addEntry: (entry: DayBookEntry) => billingService.post('/billing/daybook/add', entry),
  getTally: (date: string) => billingService.get<CashTally>(`/billing/daybook/tally?date=${date}`),
  saveTally: (tally: CashTally) => billingService.post('/billing/daybook/tally', tally),

  // Edit/Delete
  updateEntry: (id: string, entry: Partial<DayBookEntry>) => billingService.patch(`/billing/daybook/update/${id}`, entry),
  deleteEntry: (id: string) => billingService.delete(`/billing/daybook/delete/${id}`),
  getRange: (start: string, end: string) => billingService.get<{
    summary: { totalIncome: number; totalExpense: number };
    dailyBreakdown: { date: string; income: number; expense: number }[];
    chartData: { date: string; income: number; expense: number }[];
  }>(`/billing/daybook/range?start=${start}&end=${end}&startDate=${start}&endDate=${end}`),
};



export interface Commission {
  id?: string;
  brokerId?: string;
  staffId?: string;
  staffName?: string;
  billId?: string;
  billNo?: string;
  serviceId?: string;
  serviceName?: string;
  date?: string;
  amount: number; // Sale amount
  commissionAmount?: number; // Broker commission
  staffCommissionAmount?: number; // Staff commission
  percentage?: number;
  status: 'UNPAID' | 'PAID';
  paidDate?: string;
  paymentMethod?: string; // Cash | UPI | Card — used for expense bucketing
  createdAt?: string;
  updatedAt?: string;
}


// --- Estimation API ---

export interface Estimation {
  id?: string;
  estimationId: string;
  customerName: string;
  customerPhone: number;
  customerAddress?: string;
  customerGst?: string;
  items: BillDetails[];
  totalDiscountAmount?: number;
  totalGstAmount?: number;
  finalAmount?: number;
  systemType?: 'Retail' | 'SERVICE' | 'PACKAGE'; // Added systemType
  createdAt?: string;
}

export const estimationApi = {
  create: (data: Estimation) => billingService.post('/estimations/create', data),
  getAll: () => billingService.get<Estimation[]>('/estimations/all'),
  getById: (id: string) => billingService.get<Estimation>(`/estimations/${encodeURIComponent(id)}`),
  update: (id: string, data: Estimation) => billingService.put(`/estimations/${encodeURIComponent(id)}`, data),
};

export const appointmentApi = {
  getAll: () => appointmentService.get<Appointment[]>('/appointments/all'),
  add: (data: Partial<Appointment>) => appointmentService.post('/appointments/add', data),
  update: (id: string, data: Partial<Appointment>) => appointmentService.patch(`/appointments/update/${id}`, data),
  delete: (id: string) => appointmentService.delete(`/appointments/delete/${id}`),
};

// --- Stock Transaction API ---

export interface StockTransaction {
  id?: string;
  productId: string;
  productName: string;
  transactionType: 'OPENING_STOCK' | 'STOCK_IN' | 'SALE' | 'DAMAGED' | 'ADJUSTMENT' | 'CORRECTION';
  quantity: number;
  previousStock: number;
  resultingStock: number;
  referenceType?: 'SUPPLIER' | 'BILL' | 'MANUAL';
  referenceId?: string;
  reason?: string;
  createdAt?: string;
  createdBy?: string;
}

export const stockTransactionApi = {
  getAll: () => productService.get<StockTransaction[]>('/stock-transactions/all'),
  add: (data: StockTransaction) => productService.post('/stock-transactions/add', data),
  getByProduct: async (productId: string) => {
    const res = await productService.get<StockTransaction[]>('/stock-transactions/all');
    if (res.data && Array.isArray(res.data)) {
      res.data = res.data.filter(t => t.productId === productId).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    return res;
  }
};

// --- Packages API ---

export interface PackageItem {
  serviceId: string;
  serviceName?: string;
  quantity: number;
}

export interface SalonPackage {
  id?: string;
  name: string;
  description?: string;
  price: number;
  isActive: boolean;
  items: PackageItem[];
  createdAt?: string;
  updatedAt?: string;
}

export const packageApi = {
  getAll: () => productService.get<SalonPackage[]>('/packages/all'),
  add: (data: Partial<SalonPackage>) => productService.post('/packages/add', data),
  update: (id: string, data: Partial<SalonPackage>) => productService.patch(`/packages/update/${id}`, data),
  delete: (id: string) => productService.delete(`/packages/delete/${id}`),
};

export interface CustomerPackageUsage {
  serviceId: string;
  serviceName: string;
  totalQuantity: number;
  usedQuantity: number;
}

export interface CustomerPackage {
  id?: string;
  customerId: string;
  packageId: string;
  packageName: string;
  purchaseDate: string;
  billId?: string;
  isActive: boolean;
  items: CustomerPackageUsage[];
}

export const customerPackageApi = {
  getByCustomer: (customerId: string) => productService.get<CustomerPackage[]>(`/customer-packages/customer/${customerId}`),
  add: (data: Partial<CustomerPackage>) => productService.post('/customer-packages/add', data),
  updateUsage: (id: string, serviceId: string, qty: number) => productService.patch(`/customer-packages/use/${id}`, { serviceId, qty }),
  usePackage: (id: string, serviceId: string, qty: number) => productService.patch(`/customer-packages/use/${id}`, { serviceId, qty }),
};

// --- Settings API ---
export interface GlobalSettings {
  shopName: string;
  gstNumber: string;
  billMessage: string;
  defaultGst: string;
  loyaltyEnabled: boolean;
  loyaltySpendRatio: number;
  loyaltyRedeemValue: number;
  addressLine1?: string;
  addressLine2?: string;
  contactNo?: string;
  bankName?: string;
  accountNo?: string;
  ifscCode?: string;
  branchName?: string;
}

export const settingsApi = {
  get: () => billingService.get<GlobalSettings>('/settings/global'),
  update: (data: Partial<GlobalSettings>) => billingService.patch('/settings/global', data)
};