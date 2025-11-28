const axios = require("axios");
require("dotenv").config();

const AGREGATOR_TOKEN = process.env.PAWAPAY_API_TOKEN || "";
const AGREGATOR_BASE =
  process.env.PAWAPAY_BASE_URL || "";
 
if (!AGREGATOR_TOKEN) {
  console.warn("⚠️ AGREGATOR_API_TOKEN not set in .env");
}

// Helper: unified request
async function _pawapayRequest({
  method = "GET",
  url,
  base = AGREGATOR_BASE,
  data = null,
  params = null,
}) {

    console.log(`Requête pour AGREGATEUR: ${base}${url}`);
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

    return { success: true,data: res.data};
  } catch (err) {
    // normalize error
    const payload = err.response || err.message;
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
async function createPawapayPayin(payload) {

  return await _pawapayRequest({ method: "POST", url: "/deposits", data: payload });
}

async function createPawapayPayinWithOTP(payload) {
  if (!payload.otp_code)
    return {
      success: false,
      message: "otp_code is required for this endpoint",
    };
  return await createPawapayPayin(payload);
}

 

// Wallet OTP generation (otp endpoint)
async function createPawapayWalletOTP(payload) {

  return await _pawapayRequest({ method: "POST", url: "/deposits/otp", data: payload });
}

async function createPawapayWalletPayinWithOTP(payload) {
  if (!payload.otp_code)
    return { success: false, message: "otp_code is required" };
  return await createPawapayPayin(payload); 
}

// ------------------------
//PAYOUT
// ------------------------
async function createPawapayPayout(payload) {
  return await _pawapayRequest({
    method: "POST",
    url: "/payouts",
    data: payload,
  });
}



module.exports = {
  // payin
  createPawapayPayin,
  createPawapayPayinWithOTP,
  // wallet
  createPawapayWalletOTP,
  createPawapayWalletPayinWithOTP,
  // payout
  createPawapayPayout,
};
