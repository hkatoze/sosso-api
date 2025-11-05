const axios = require("axios");

async function sendVerificationCode(phone_number, verificationCode) {
  try {
    const url = "https://www.aqilas.com/api/v1/sms";
    const headers = {
      "X-AUTH-TOKEN": '81fb066a-9e2d-4ed6-95dd-aa23c476d3e5',
      "Content-Type": "application/json",
    };

    const data = {
      from: "SUCCESS",
      text: `Code de confirmation: ${verificationCode}`,
      to: [`+226${phone_number}`],
    };

    const response = await axios.post(url, data, { headers });

    return response.data;
  } catch (error) {
    console.error("Impossible d'envoyer le message:", error);
  }
}

module.exports = { sendVerificationCode };
