const axios = require("axios");
require("dotenv").config();

const AGREGATOR_TOKEN = process.env.AGREGATOR_API_TOKEN || "";
const AGREGATOR_BASE =
  process.env.AGREGATOR_BASE_URL || "https://api.sandbox.pawapay.io/v2";
 
if (!AGREGATOR_TOKEN) {
  console.warn("⚠️ AGREGATOR_API_TOKEN not set in .env");
}

// Helper: unified request
async function _request({
  method = "GET",
  url,
  base = AGREGATOR_BASE,
  data = null,
  params = null,
}) {
  try {
    const res = await axios({
      method,
      url: `${base}${url}`,
      headers: {
        Authorization: `Bearer ${AGREGATOR_TOKEN}`,
        "Content-Type": "application/json",
      },
      data,
      params,
      timeout: 30000,
    });

    return { success: true,data: res.body};
  } catch (err) {
    // normalize error
    const payload = err.response?.body || err.message;
    console.error("Agregator request error:", payload);
    return {
      success: false,
      message: payload?.message || String(payload),
      data: payload,
    };
  }
}

// ------------------------
//PAYIN
// ------------------------
async function createPayin(payload) {

  return await _request({ method: "POST", url: "/deposits", data: payload });
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
  return await createPayin(payload);
}

// Wallet OTP generation (otp endpoint)
async function createWalletOTP(payload) {

  return await _request({ method: "POST", url: "/deposits/otp", data: payload });
}

async function createWalletPayinWithOTP(payload) {
  if (!payload.otp_code)
    return { success: false, message: "otp_code is required" };
  return await createPayin(payload); 
}

// ------------------------
//PAYOUT
// ------------------------
async function createPayout(payload) {
  // note: payout base differs in their docs
  return await _request({
    method: "POST",
    url: "/payouts",
    data: payload,
  });
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
};
