const axios = require("axios");
require("dotenv").config();

const AGREGATOR_TOKEN = process.env.LIGDI_API_TOKEN || "";
const AGREGATOR_KEY = process.env.LIGDI_API_KEY || "";
const AGREGATOR_BASE =
  process.env.LIGDI_BASE_URL || "https://app.ligdicash.com/pay/v01";
 
if (!AGREGATOR_TOKEN) {
  console.warn("⚠️ AGREGATOR_API_TOKEN not set in .env");
}

// Helper: unified request
async function _ligdiRequest({
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
        Apikey: AGREGATOR_KEY,
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
    const payload = err.response || err.message || err.response_text;
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
async function createLigdiPayin(payload) {

  return await _ligdiRequest({ method: "POST", url: "/straight/checkout-invoice/create", data: payload });
}

async function createLigdiPayinWithOTP(payload) {
  if (!payload.commande.invoice.otp)
    return {
      success: false,
      message: "otp is required for this endpoint",
    };
  return await createLigdiPayin(payload);
}

// ------------------------
//PAYOUT
// ------------------------
async function createLigdiPayout(payload) {
  return await _ligdiRequest({
    method: "POST",
    url: "/straight/payout",
    data: payload,
  });
}

async function createLigdiPayoutForLigdiClient(payload) {
  return await _ligdiRequest({
    method: "POST",
    url: "/withdrawal/create",
    data: payload,
  });
}
async function createLigdiRefund(payload) {
  return await _ligdiRequest({
    method: "POST",
    url: "/straight/payout",
    data: payload,
  });
}

// ------------------------
//CHECK STATUS
// ------------------------
async function checkLigdiPayinStatus(payinToken) {
  return await _ligdiRequest({
    method: "POST",
    url: "/redirect/checkout-invoice/confirm/?invoiceToken="+payinToken,
  });
}

async function checkLigdiPayoutStatus(payoutToken) {
  return await _ligdiRequest({
    method: "POST",
    url: "/straight/payout/confirm/?payoutToken="+payoutToken,
  });
}

async function checkLigdiClientPayoutStatus(withdrawalToken) {
  return await _ligdiRequest({
    method: "POST",
    url: "/withdrawal/confirm/?withdrawalToken="+withdrawalToken,
  });
}





module.exports = {
  // payin
  createLigdiPayin,
  createLigdiPayinWithOTP,
  // status
  checkLigdiPayinStatus,
  checkLigdiPayoutStatus,
  checkLigdiClientPayoutStatus,
  // payout
  createLigdiPayout,
  createLigdiPayoutForLigdiClient,
  createLigdiRefund,
};
