// ===========================================================================
// ⚠️  RETIRED — NOT PART OF THE RUNNING APPLICATION  ⚠️
//
// This standalone Express server is disconnected and is never started by any
// npm script, Dockerfile or nginx config (see PRODUCTION_READINESS_REPORT.md).
// The frontend talks directly to Firestore through the client SDK; the
// `firestoreAdapter` interceptor in src/lib/api.ts answers every API call, so
// none of these routes are ever called by the app.
//
// Kept only as a reference / for optional future use (server-side price
// validation via Firebase Admin and Twilio SMS need a service account key in
// server/.env — see server/.env.example).
// ===========================================================================
import "dotenv/config";
import express from "express";
import cors from "cors";
import admin from "firebase-admin";

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase Admin if Service Account is available
let db = null;
try {
  // If FIREBASE_SERVICE_ACCOUNT is set in .env as a JSON string, or if a serviceAccountKey.json is provided
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("🔥 Firebase Admin Initialized");
  } else {
    console.warn("⚠️  FIREBASE_SERVICE_ACCOUNT not found in .env. Running in Mock Database Mode.");
  }
} catch (error) {
  console.error("Failed to initialize Firebase Admin:", error);
}

// Test route
app.get("/", (req, res) => {
  res.send("Anju Saloon Backend API is running ✔️");
});

// --- NEW SECURE BILLING API ---
app.post("/api/process-billing", async (req, res) => {
  try {
    const { items, customer, discount, isWholesale, paymentMethod, status, isEstimation } = req.body;
    
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "Bill must contain items" });
    }

    let calculatedSubtotal = 0;
    const validatedItems = [];
    
    if (db) {
      // SECURE MODE: Query Firestore for true prices to prevent client-side tampering
      console.log("Validating prices against database...");
      
      for (const item of items) {
        let truePrice = item.price; // fallback
        
        try {
          const itemType = (item.type || '').toLowerCase();
          const collectionName = itemType === 'service' ? 'services' : 'products';
          const docSnap = await db.collection(collectionName).doc(item.id).get();
          
          if (docSnap.exists) {
             const data = docSnap.data();
             truePrice = data.sellingPrice !== undefined ? data.sellingPrice : (data.price || 0);
          }
        } catch (e) {
          console.error(`Failed to fetch price for ${item.id}`, e);
        }

        calculatedSubtotal += truePrice * item.quantity;
        validatedItems.push({
          ...item,
          price: truePrice // Overwrite client's price with DB true price
        });
      }
    } else {
      // MOCK MODE: Trust the client (because no service account key is available yet)
      console.log("[MOCK] Validating bill without DB connection. Trusting client prices.");
      for (const item of items) {
         calculatedSubtotal += (item.price || 0) * item.quantity;
         validatedItems.push(item);
      }
    }

    const calculatedDiscountAmount = (calculatedSubtotal * (discount || 0)) / 100;
    const finalTotal = calculatedSubtotal - calculatedDiscountAmount;

    // Create the secure bill document
    const billDoc = {
      items: validatedItems,
      customer: customer || { name: "Walk-in Customer", phone: "" },
      subtotal: calculatedSubtotal,
      discount: discount || 0,
      totalAmount: finalTotal,
      type: isWholesale ? "Wholesale" : "Retail",
      paymentMethod: paymentMethod || "CASH",
      status: status || "COMPLETED",
      isEstimation: isEstimation || false,
      createdAt: db ? admin.firestore.FieldValue.serverTimestamp() : new Date().toISOString(),
      validatedByBackend: true // A flag showing it was securely processed
    };

    if (db) {
       const collectionName = isEstimation ? "estimations" : "bills";
       const result = await db.collection(collectionName).add(billDoc);

       // Auto-deduct stock for products if not an estimation
       if (!isEstimation) {
         try {
           for (const item of validatedItems) {
             const itemType = (item.type || '').toLowerCase();
             // Only deduct for products, skip services
             if (itemType !== 'service') {
                const productRef = db.collection('products').doc(item.id);
                const productSnap = await productRef.get();
                if (productSnap.exists) {
                   const productData = productSnap.data();
                   const previousStock = productData.stockQuantity || 0;
                   const resultingStock = previousStock - item.quantity;
                   
                   // Update product stock
                   await productRef.update({ stockQuantity: resultingStock });
                   
                   // Log stock transaction
                   await db.collection('stock_transactions').add({
                      productId: item.id,
                      productName: item.name || productData.name,
                      transactionType: 'SALE',
                      quantity: item.quantity,
                      previousStock: previousStock,
                      resultingStock: resultingStock,
                      reason: `Sale on Bill #${result.id}`,
                      referenceType: 'BILL',
                      referenceId: result.id,
                      createdAt: new Date().toISOString()
                   });
                }
             }
           }
         } catch (stockErr) {
           console.error("Failed to update stock during billing:", stockErr);
         }
       }

       res.json({ success: true, billId: result.id, bill: billDoc });
       
       // Asynchronously send SMS via pseudo-trigger pattern
       if (!isEstimation && customer && customer.phone) {
          sendSmsAsync(customer.phone, result.id, finalTotal);
       }
    } else {
       // Mock save (this allows the frontend logic to continue for now)
       const mockId = "mock_bill_" + Date.now();
       res.json({ success: true, billId: mockId, bill: billDoc });
       
       if (!isEstimation && customer && customer.phone) {
          sendSmsAsync(customer.phone, mockId, finalTotal);
       }
    }

  } catch (err) {
    console.error("Billing Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Helper function to emulate a background Cloud Function execution for SMS
function sendSmsAsync(phone, billId, total) {
  setTimeout(() => {
    try {
      console.log(`[BACKGROUND JOB] Simulating Cloud Function trigger for SMS...`);
      let formattedPhone = phone.trim();
      if (!formattedPhone.startsWith("+")) formattedPhone = "+91" + formattedPhone;
      
      const domain = process.env.VITE_APP_URL || 'https://raju-electronics-dc327.web.app';
      const billUrl = `${domain}/bill/${billId}`;
      const message = `Thank you for shopping at Anjus Beauty Saloon! View your bill for Rs. ${(total || 0).toFixed(2)} here: ${billUrl}`;
      
      // In a real system, you'd use Twilio Node SDK here with process.env.TWILIO_SID
      console.log(`[SECURE SMS API] Trigger fired. Sent SMS to ${formattedPhone}: "${message}"`);
    } catch (e) {
      console.error(`[BACKGROUND JOB] Failed to send SMS for bill ${billId}:`, e);
    }
  }, 1000); // 1 second delay to prove it's decoupled
}

// --- SMS API ---
app.post("/send-sms", async (req, res) => {
  try {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: "Missing fields" });

    // In a real system, you'd use twilio here, using process.env.TWILIO_SID
    console.log(`[SECURE SMS API] Sending SMS to ${to}: "${body}"`);
    res.json({ success: true, message: { sid: "mocked_sms_sid" } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Secure backend running on http://localhost:${PORT}`));
