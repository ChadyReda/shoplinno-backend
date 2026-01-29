// ================== ENV SETUP ==================
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

// ================== IMPORTS ==================
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";

// ================== APP SETUP ==================
const app = express();

app.use(cors({
  origin: [
    "https://www.shoplinno.com",
    "https://shoplinno.com",
    "https://shoplinno.vercel.app",
    "http://localhost:5173"
  ],
  credentials: true
}));

app.use(express.json());

// ================== SUPABASE ==================
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error("❌ Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false }
});

// ================== ROUTER ==================
const api = express.Router();

// ================== HEALTH ==================
api.get("/health", (_, res) => {
  res.json({ status: "OK", server_time: new Date().toISOString() });
});

// ================== PLANS ==================
api.get("/plans", async (_, res) => {
  try {
    const { data, error } = await supabase
      .from("plans")
      .select("id, name, price, features")
      .order("price");

    if (error) throw error;

    res.json({ success: true, plans: data });
  } catch (err) {
    console.error("Plans fetch error:", err);
    res.status(500).json({ success: false, error: "Unable to fetch plans" });
  }
});

// ================== SUBSCRIBE ==================
api.post("/subscribe", async (req, res) => {
  try {
    const { plan_id, customer_info } = req.body;

    if (!plan_id || !customer_info?.fullname || !customer_info?.email) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields"
      });
    }

    const startDate = new Date();
    const endDate = new Date(startDate);

    switch (plan_id) {
      case "monthly":
        endDate.setMonth(endDate.getMonth() + 1);
        break;
      case "2months":
        endDate.setMonth(endDate.getMonth() + 2);
        break;
      case "annual":
        endDate.setFullYear(endDate.getFullYear() + 1);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: "Invalid plan"
        });
    }

    const user_id = crypto.randomUUID();

    const { error: subError } = await supabase
      .from("subscriptions")
      .insert({
        user_id,
        plan_id,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: "active"
      });

    if (subError) throw subError;

    const { error: msgError } = await supabase
      .from("messages")
      .insert({
        user_id,
        subject: "New IPTV Subscription",
        message: `
Name: ${customer_info.fullname}
Email: ${customer_info.email}
Phone: ${customer_info.phone || "N/A"}
Plan: ${plan_id}
        `.trim()
      });

    if (msgError) throw msgError;

    res.json({
      success: true,
      subscription: {
        plan: plan_id,
        start_date: startDate,
        end_date: endDate
      }
    });

  } catch (err) {
    console.error("Subscribe error:", err);
    res.status(500).json({
      success: false,
      error: "Subscription failed"
    });
  }
});

// ================== CONTACT ==================
api.post("/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing fields"
      });
    }

    const { error } = await supabase
      .from("contact_messages")
      .insert({ name, email, message });

    if (error) throw error;

    res.json({ success: true });

  } catch (err) {
    console.error("Contact error:", err);
    res.status(500).json({
      success: false,
      error: "Unable to send message"
    });
  }
});

// ================== MOUNT ==================
app.use("/api", api);

const PORT = process.env.PORT || 3001;

if (!process.env.VERCEL) {
  app.listen(PORT, () =>
    console.log(`🚀 API running at http://localhost:${PORT}`)
  );
}

export default app;
