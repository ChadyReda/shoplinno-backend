// --- Setup for Environment Variables ---
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

const app = express();

// Middleware
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'https://shoplinno.vercel.app',
    ];
    if (process.env.VERCEL || !origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

// ===== SUPABASE SETUP =====
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Missing Supabase environment variables. Make sure .env file is present in /api folder.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

// ===== API ROUTER =====
const apiRouter = express.Router();

apiRouter.get("/plans", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("plans")
      .select("id, name, price, features")
      .order("price", { ascending: true });

    if (error) {
      console.error("Error fetching plans:", error);
      return res.status(500).json({ error: "Could not fetch plans." });
    }

    res.json({ success: true, plans: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
apiRouter.get("/health", (req, res) => {
  res.json({
    status: "OK",
    server_time: new Date().toISOString(),
  });
});

// Contact form endpoint
apiRouter.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    // Validate required fields
    if (!name || !email || !message) {
      return res.status(400).json({ 
        success: false, 
        error: "All fields are required: name, email, message" 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        error: "Invalid email format" 
      });
    }

    // Generate a user ID for tracking (or use existing if user is logged in)
    const userId = `contact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save to messages table
    const { error: dbError } = await supabase
      .from("messages")
      .insert({
        user_id: userId,
        subject: `Contact Form: ${name}`,
        message: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
        type: "contact_form",
        created_at: new Date().toISOString()
      });

    if (dbError) {
      console.error("Database error saving contact form:", dbError);
      return res.status(500).json({ 
        success: false, 
        error: "Failed to save contact message to database" 
      });
    }

    // Optional: Send email notification (you'd need to set up email service)
    // await sendContactEmail(name, email, message);

    res.json({
      success: true,
      message: "Contact message received successfully",
      data: {
        name,
        email,
        messageId: userId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({ 
      success: false, 
      error: "Server error processing contact form" 
    });
  }
});

// Subscribe endpoint
apiRouter.post("/subscribe", async (req, res) => {
  try {
    const { user_id, plan_id, payment_method, customer_info } = req.body;

    if (!customer_info) {
      return res.status(400).json({ error: "Customer info missing" });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);

    if (plan_id === "monthly") endDate.setMonth(endDate.getMonth() + 1);
    else if (plan_id === "2months") endDate.setMonth(endDate.getMonth() + 2);
    else if (plan_id === "annual") endDate.setFullYear(endDate.getFullYear() + 1);
    else endDate.setMonth(endDate.getMonth() + 1);

    const { error: subError } = await supabase.from("subscriptions").insert({
      user_id,
      plan_id,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      status: "active",
    });

    const { error: msgError } = await supabase.from("messages").insert({
      user_id,
      subject: "New IPTV Subscription - " + customer_info.email,
      message: `Name: ${customer_info.fullname}\nEmail: ${customer_info.email}\nPhone: ${customer_info.phone || "N/A"}\nPlan: ${plan_id}\nPayment: ${payment_method}`,
    });

    if (subError || msgError) {
        console.error("DB Error:", {subError, msgError});
        return res.status(500).json({ error: "Failed to save data to database." });
    }

    res.json({
      success: true,
      saved_to_db: true
    });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Optional: Get all messages (for admin dashboard)
apiRouter.get("/messages", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching messages:", error);
      return res.status(500).json({ error: "Could not fetch messages." });
    }

    res.json({ success: true, messages: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Use the router for all /api routes
app.use('/api', apiRouter);

const PORT = process.env.PORT || 3001;

if (process.env.VERCEL === undefined) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

export default app;
