const axios = require("axios");

async function sendVerificationCode(phone_number, verificationCode) {
  try {
    const url = "https://www.aqilas.com/api/v1/sms";
    const headers = {
      "X-AUTH-TOKEN": "f094e085-6d96-4b3a-9ae5-a67925317b9a",
      "Content-Type": "application/json",
    };

    const data = {
      from: "SOSSO",
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
