// services/transactionService.js
const { Transaction, Operator } = require("../db/sequelize").models;
const afri = require("../routes/afribapayEndpoints");

async function triggerPayout(transaction) {
  try {
    console.log(
      `[AFRIBAPAY] Déclenchement automatique du PAYOUT pour ${transaction.reference}`
    );

    const receiverOperator = await Operator.findByPk(
      transaction.receiver_operator_id
    );
    if (!receiverOperator) throw new Error("Opérateur receveur introuvable");

    const payoutPayload = {
      operator: receiverOperator.short_code,
      country: "BF",
      phone_number: transaction.receiver_phone,
      amount: parseFloat(transaction.amount),
      currency: "XOF",
      order_id: transaction.reference + "-OUT",
      merchant_key: process.env.AFRIBAPAY_MERCHANT_KEY,
      reference_id: transaction.reference,
      lang: "fr",
      return_url: process.env.AFRIBAPAY_RETURN_URL,
      cancel_url: process.env.AFRIBAPAY_CANCEL_URL,
      notify_url: process.env.AFRIBAPAY_WEBHOOK_URL,
    };

    const result = await afri.createPayout(payoutPayload);

    if (!result.success) {
      await transaction.update({
        status: "failed_payout",
        metadata: result.data,
      });
      console.error(`[AFRIBAPAY] Échec du PAYOUT : ${result.message}`);
      return false;
    }

    await transaction.update({
      status: "processing_payout",
      provider_reference: result.data.transaction_id,
      metadata: result.data,
    });

    console.log(
      `[AFRIBAPAY] PAYOUT lancé avec succès pour ${transaction.reference}`
    );
    return true;
  } catch (err) {
    console.error("[AFRIBAPAY] Erreur dans triggerPayout:", err.message);
    return false;
  }
}

module.exports = { triggerPayout };
