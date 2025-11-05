const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const AFRIBAPAY_TOKEN = process.env.AFRIBAPAY_API_TOKEN || "";
const AFRIBAPAY_BASE =
  process.env.AFRIBAPAY_BASE_URL || "https://api-sandbox.afribapay.com/v1";
const AFRIBAPAY_PAYOUT_BASE =
  process.env.AFRIBAPAY_PAYOUT_URL ||
  "https://api-payout-sandbox.afribapay.com/v1";

if (!AFRIBAPAY_TOKEN) {
  console.warn("⚠️ AFRIBAPAY_API_TOKEN not set in .env");
}

// Helper: unified request
async function _request({
  method = "GET",
  url,
  base = AFRIBAPAY_BASE,
  data = null,
  params = null,
}) {
  try {
    const res = await axios({
      method,
      url: `${base}${url}`,
      headers: {
        Authorization: `Bearer ${AFRIBAPAY_TOKEN}`,
        "Content-Type": "application/json",
      },
      data,
      params,
      timeout: 30000,
    });

    return { success: true, raw: res.data, data: res.data.data || res.data };
  } catch (err) {
    // normalize error
    const payload = err.response?.data || err.message;
    console.error("AfribaPay request error:", payload);
    return {
      success: false,
      message: payload?.message || String(payload),
      data: payload,
    };
  }
}

// ------------------------
// PAYIN (generic)
// ------------------------
async function createPayin(payload) {
  // payload should contain operator, country, phone_number, amount, currency, order_id, merchant_key, reference_id, etc.
  return await _request({ method: "POST", url: "/pay/payin", data: payload });
}

async function createPayinWithOTP(payload) {
  if (!payload.otp_code)
    return {
      success: false,
      message: "otp_code is required for this endpoint",
    };
  return await createPayin(payload);
}

// Wave payin returns provider_link in data — front should redirect user to provider_link
async function createPayinWave(payload) {
  // same endpoint, but operator: 'wave' expected
  return await createPayin(payload);
}

// Wallet OTP generation (otp endpoint)
async function createWalletOTP(payload) {
  // payload: operator, country, phone_number, amount, currency, merchant_key
  return await _request({ method: "POST", url: "/pay/otp", data: payload });
}

async function createWalletPayinWithOTP(payload) {
  if (!payload.otp_code)
    return { success: false, message: "otp_code is required" };
  return await createPayin(payload); // identical flow
}

// ------------------------
// PAYOUT
// ------------------------
async function createPayout(payload) {
  // note: payout base differs in their docs
  return await _request({
    method: "POST",
    url: "/pay/payout",
    base: AFRIBAPAY_PAYOUT_BASE,
    data: payload,
  });
}

// ------------------------
// STATUS
// ------------------------
async function getStatusByOrderId(order_id) {
  if (!order_id) return { success: false, message: "order_id required" };
  return await _request({
    method: "GET",
    url: "/status",
    params: { order_id },
  });
}

async function getStatusByTransactionId(transaction_id) {
  if (!transaction_id)
    return { success: false, message: "transaction_id required" };
  return await _request({
    method: "GET",
    url: "/status",
    params: { transaction_id },
  });
}

// ------------------------
// BALANCE
// ------------------------
async function getBalance() {
  return await _request({ method: "GET", url: "/balance" });
}

// ------------------------
// HISTORY
// ------------------------
async function getHistory({ size = 100, date_start, date_end } = {}) {
  const params = { size };
  if (date_start) params.date_start = date_start;
  if (date_end) params.date_end = date_end;
  return await _request({ method: "GET", url: "/history", params });
}

// ------------------------
// Webhook signature verification
// ------------------------
function verifyWebhookSignature(rawBody, apiKey, receivedSignature) {
  const computed = crypto
    .createHmac("sha256", apiKey)
    .update(rawBody)
    .digest("hex");
  return computed === receivedSignature;
}

// Express handler helper for webhook (to plug into your routes)
// Example usage:
// app.post('/api/v1/webhook/afribapay', express.raw({ type: 'application/json' }), handleAfribaPayWebhook);
async function handleAfribaPayWebhook(
  req,
  res,
  { apiKey = process.env.AFRIBAPAY_API_TOKEN, onValidated } = {}
) {
  // req.body must be raw string if you want to verify signature correctly
  // If using express.json(), you should also capture raw body in middleware.
  try {
    const raw = req.rawBody || JSON.stringify(req.body);
    const headerSignature =
      req.headers["afribapay_sign"] ||
      req.headers["afribapay-sign"] ||
      req.headers["afribapay_sign"];

    if (!headerSignature) {
      console.warn("Webhook signature header missing");
      return res.status(403).send("Signature header missing");
    }

    const ok = verifyWebhookSignature(raw, apiKey, headerSignature);
    if (!ok) {
      console.warn("Invalid webhook signature");
      return res.status(403).send("Invalid signature");
    }

    // Parse payload
    const payload =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // Call user-provided handler if exists
    if (typeof onValidated === "function") {
      try {
        await onValidated(payload, req, res);
      } catch (uhErr) {
        console.error("onValidated handler error", uhErr);
      }
    }

    // Acknowledge
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("handleAfribaPayWebhook error", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = {
  // payin
  createPayin,
  createPayinWithOTP,
  createPayinWave,
  // wallet
  createWalletOTP,
  createWalletPayinWithOTP,
  // payout
  createPayout,
  // status
  getStatusByOrderId,
  getStatusByTransactionId,
  // balance & history
  getBalance,
  getHistory,
  // webhook
  verifyWebhookSignature,
  handleAfribaPayWebhook,
};
