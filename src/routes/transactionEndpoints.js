
const { Transaction, User, Operator, Device, ApiProvider } =
  require("../db/sequelize").models;
const { ValidationError, Op } = require("sequelize");
const auth = require("../auth/auth");
const { v4: uuidv4 } = require("uuid");
const afri = require("../routes/merchandApiEndpoints");
const { triggerPayout } = require("../utilsFunctions/transactionsTrigger");
const { matchingOperator } = require("../utilsFunctions/matchingOperator");
module.exports = (app) => {
  // Étape 1: INITIER un transfert (PAYIN)
  app.post("/api/v1/transactions/", async (req, res) => {
    try {
      const {
        user_id,
        device_id,
        sender_operator_id,
        sender_phone,
        receiver_operator_id,
        receiver_phone,
        amount,
      } = req.body;

      if (
        !sender_operator_id ||
        !receiver_operator_id ||
        !sender_phone ||
        !receiver_phone ||
        !amount
      ) {
        return res.status(400).json({
          success: false,
          message: "Champs obligatoires manquants.",
        });
      }

      // Récupérer les opérateurs
      const senderOperator = await Operator.findByPk(sender_operator_id);
      const receiverOperator = await Operator.findByPk(receiver_operator_id);

      if (!senderOperator || !receiverOperator) {
        return res
          .status(404)
          .json({ success: false, message: "Opérateur introuvable." });
      }

      // Créer une référence unique
      const reference = uuidv4().slice(0, 36).toUpperCase();
      const fees = parseFloat(amount) * 0.01; // 1% pour l’instant
      const amount_received = parseFloat(amount) - fees;

      // 1️⃣ Créer la transaction locale (status = pending)
      const transaction = await Transaction.create({
        reference,
        user_id,
        device_id,
        sender_operator_id,
        receiver_operator_id,
        sender_phone,
        receiver_phone,
        amount,
        fees,
        amount_received,
        total_amount: parseFloat(amount) + fees,
        status: "pending",
        transaction_datetime: new Date(),
      });

      // 2️⃣ Appeler  PAYIN
      const payinPayload = {
        depositId: reference,
        amount: parseFloat(amount).toString(),
        currency: "XOF",
        payer:{
          type: "MMO",
            accountDetails: {
                phoneNumber: "226"+sender_phone,
                provider: matchingOperator(senderOperator.short_code)
            }
        },

       
      };


      const result = await afri.createPayin(payinPayload);
      console.log(result);

      if (!result.success) {
        transaction.status = "failed";
        await transaction.save();
        return res.status(500).json({
          success: false,
          message: "Échec du PAYIN",
          error: result.message,
        });
      }

      if(result.data.status =="REJECTED"){
        await transaction.update({
        provider_reference: result.data.providerTransactionId,
        metadata: result.data,
        status: "failed",
      });
      return res.status(201).json({
        success: true,
        message:
          "PAYIN failed.",
        data: result.data,
      });
      }

      // 3️⃣ Mise à jour transaction locale avec les infos AfribaPAY
      await transaction.update({
        provider_reference: result.data.providerTransactionId,
        metadata: result.data,
        status: "processing_payin",
      });
     console.log("REFERENCE CREE: "+reference);
      return res.status(201).json({
        success: true,
        message:
          "PAYIN initié avec succès. En attente de validation du client.",
        data: result.data,
      });
    } catch (error) {
      console.error("Erreur /transactions/initiate:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de l'initialisation du transfert.",
        data: error.message,
      });
    }
  });

app.post("/api/v1/transactions/complete/payin", async (req, res) => {
  try {
    const { depositId, status, providerTransactionId } = req.body;
    const reference = depositId;

    if (!reference) {
      console.log("Référence manquante.");
      return res.status(400).json({ success: false, message: "Référence manquante." });
    }

    console.log("REFERENCE RECU:", reference);
    const transaction = await Transaction.findOne({ where: { reference: reference.toUpperCase() } });

    if (!transaction) {
      console.log("Transaction introuvable.");
      return res.status(404).json({ success: false, message: "Transaction introuvable." });
    }

    // idempotence : si la transaction a déjà été traitée comme payin réussi, on ack sans relancer
    const alreadyProcessed = ["success_payin", "success_payin_processing_payout", "success_payin_failed_payout", "success_payin_success_payout"]
      .includes(transaction.status);
    if (alreadyProcessed) {
      console.log("Callback reçu pour transaction déjà traitée:", transaction.reference, transaction.status);
      return res.status(200).json({ success: true, message: "Already processed", data: { status: transaction.status } });
    }

    const s = (status || "").toString().toUpperCase().trim();

    switch (s) {
      case "ACCEPTED":
        console.log("PAYIN", s);
        // Acknowledge accepted; not final
        await transaction.update({ provider_reference: providerTransactionId || transaction.provider_reference });
        return res.status(200).json({ success: true, message: "PAYIN " + s });
      case "SUBMITTED":
        console.log("PAYIN", s);
        return res.status(200).json({ success: false, message: "PAYIN " + s });
      case "FAILED":
        console.log("PAYIN", s);
        await transaction.update({ status: "payin_failed", provider_reference: providerTransactionId || transaction.provider_reference });
        return res.status(200).json({ success: false, message: "PAYIN " + s });
      case "REJECTED":
        console.log("PAYIN", s);
        await transaction.update({ status: "payin_failed", provider_reference: providerTransactionId || transaction.provider_reference });
        return res.status(200).json({ success: false, message: "PAYIN " + s });
        
      case "COMPLETED":
        console.log("SUCCESS_PAYIN.");
        await transaction.update({
          status: "success_payin",
          provider_reference: providerTransactionId || transaction.provider_reference,
        });
        break; // continuer pour déclencher le payout
      default:
        console.warn("Statut PAYIN inconnu:", status);
        return res.status(400).json({ success: false, message: "Statut inconnu: " + status });
    }

    // --- créer le PAYOUT (après "COMPLETED")
    const receiverOperator = await Operator.findByPk(transaction.receiver_operator_id);

    const payoutPayload = {
      payoutId: transaction.reference,
      amount: parseFloat(transaction.amount).toString(),
      currency: "XOF",
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber: "226" + transaction.receiver_phone,
          provider: matchingOperator(receiverOperator.short_code)
        }
      }
    };

    const result = await afri.createPayout(payoutPayload);

    if (!result || !result.success) {
      console.log("FAILED_PAYOUT.", result && result.message);
      await transaction.update({
        status: "success_payin_failed_payout",
        metadata: result ? result.data : { error: "no result" }
      });
      return res.status(500).json({
        success: false,
        message: "Échec du PAYOUT.",
        data: result ? result.message : "No result from payout"
      });
    }

    console.log("SUCCESS_PAYIN_PROCESSING_PAYOUT.");
    await transaction.update({
      status: "success_payin_processing_payout",
      provider_reference: result.data.providerTransactionId || transaction.provider_reference,
      metadata: result.data
    });

    return res.status(200).json({
      success: true,
      message: "PAYOUT initié avec succès.",
      data: result.data
    });

  } catch (error) {
    console.error("Erreur /transactions/complete/payin:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors du PAYIN/PAYOUT.",
      data: error.message
    });
  }
});


app.post("/api/v1/transactions/complete/payout", async (req, res) => {
  try {
    const { payoutId, status, providerTransactionId } = req.body;
    const reference = payoutId;

    if (!reference) {
      console.log("Référence manquante.");
      return res.status(400).json({ success: false, message: "Référence manquante." });
    }

    const transaction = await Transaction.findOne({ where: { reference: reference.toUpperCase() } });
    if (!transaction) {
      console.log("Transaction introuvable.");
      return res.status(404).json({ success: false, message: "Transaction introuvable." });
    }

    // idempotence : si déjà finalisé comme success_payin_success_payout, ack
    if (transaction.status === "success_payin_success_payout") {
      console.log("Payout callback pour transaction déjà finalisée:", transaction.reference);
      return res.status(200).json({ success: true, message: "Already finalized", data: transaction });
    }

    const s = (status || "").toString().toUpperCase().trim();

    switch (s) {
      case "ACCEPTED":
        console.log("PAYOUT", s);
        await transaction.update({ provider_reference: providerTransactionId || transaction.provider_reference });
        return res.status(200).json({ success: true, message: "PAYOUT " + s });
      case "SUBMITTED":
      case "ENQUEUED":
        console.log("PAYOUT", s);
        return res.status(200).json({ success: false, message: "PAYOUT " + s });
      case "FAILED":
        console.log("PAYOUT", s);
        await transaction.update({
          status: "success_payin_failed_payout",
          provider_reference: providerTransactionId || transaction.provider_reference
        });
        return res.status(200).json({ success: false, message: "PAYOUT " + s });

      case "REJECTED":
        console.log("PAYOUT", s);
        await transaction.update({
          status: "success_payin_failed_payout",
          provider_reference: providerTransactionId || transaction.provider_reference
        });
        return res.status(200).json({ success: false, message: "PAYOUT " + s });
      case "COMPLETED":
        console.log("SUCCESS_PAYIN_SUCCESS_PAYOUT.");
        await transaction.update({
          status: "success_payin_success_payout",
          provider_reference: providerTransactionId || transaction.provider_reference
        });
        return res.status(200).json({
          success: true,
          message: "Payin & Payout réussie",
          data: transaction
        });
      default:
        console.warn("Statut PAYOUT inconnu:", status);
        return res.status(400).json({ success: false, message: "Statut inconnu: " + status });
    }

  } catch (error) {
    console.error("Erreur /transactions/complete/payout:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors du PAYOUT.",
      data: error.message
    });
  }
});


  app.post("/api/v1/transactions/complete/refund", async (req, res) => {
    
  });
  /**
   * =====================================================
   *  GET /api/v1/transactions
   * =====================================================
   *  - Liste toutes les transactions
   */
  app.get("/api/v1/transactions", auth, async (req, res) => {
    try {
      const transactions = await Transaction.findAll({
        include: [
          { model: User, as: "user", attributes: ["id", "phone"] },
          {
            model: Device,
            as: "device",
            attributes: ["id", "device_uid", "os"],
          },
          {
            model: Operator,
            as: "senderOperator",
            attributes: ["id", "name", "short_code", "logo_url"],
          },
          {
            model: Operator,
            as: "receiverOperator",
            attributes: ["id", "name", "short_code", "logo_url"],
          },
          { model: ApiProvider, as: "provider", attributes: ["id", "name"] },
        ],
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        success: true,
        message: "Liste des transactions récupérée avec succès.",
        data: transactions,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des transactions.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/transactions/:id
   * =====================================================
   *  - Récupère une transaction précise
   */
const MAX_LIMIT = 5000;

function parseLimit(value) {
  if (!value) return null; // aucune limite

  let limit = parseInt(value, 10);

  if (isNaN(limit) || limit <= 0) return null;

  return Math.min(limit, MAX_LIMIT);
}

  app.get("/api/v1/transactions/:id", auth, async (req, res) => {
    try {
      const transaction = await Transaction.findByPk(req.params.id, {
        include: [
          { model: User, as: "user", attributes: ["id", "phone"] },
          { model: Device, as: "device", attributes: ["id", "device_uid"] },
          { model: Operator, as: "senderOperator" },
          { model: Operator, as: "receiverOperator" },
          { model: ApiProvider, as: "provider" },
        ],
      });

      if (!transaction) {
        return res
          .status(404)
          .json({ success: false, message: "Transaction non trouvée." });
      }

      res.status(200).json({
        success: true,
        message: "Transaction récupérée avec succès.",
        data: transaction,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération de la transaction.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/transactions/user/:userId
   * =====================================================
   *  - Transactions d’un utilisateur enregistré
   */
  app.get("/api/v1/transactions/user/:userId", auth, async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);

    const transactions = await Transaction.findAll({
      where: { user_id: req.params.userId },
      include: [
        { model: Operator, as: "senderOperator" },
        { model: Operator, as: "receiverOperator" },
      ],
      order: [["createdAt", "DESC"]],
      limit: limit || undefined,
    });

    res.status(200).json({
      success: true,
      message: "Transactions récupérées.",
      data: transactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération.",
      data: error.message,
    });
  }
});


  /**
   * =====================================================
   *  GET /api/v1/transactions/device/:deviceId
   * =====================================================

   */
app.get("/api/v1/transactions/device/:deviceId", auth, async (req, res) => {
  try {
    const limit = parseLimit(req.query.limit);

    const transactions = await Transaction.findAll({
      where: { device_id: req.params.deviceId },
      include: [
        { model: Operator, as: "senderOperator" },
        { model: Operator, as: "receiverOperator" },
      ],
      order: [["createdAt", "DESC"]],
      limit: limit || undefined,
    });

    res.status(200).json({
      success: true,
      message: transactions.length === 0 ?
        "Aucune transaction trouvée." :
        "Transactions récupérées.",
      data: transactions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Erreur lors de la récupération.",
      data: error.message,
    });
  }
});


  /**
   * =====================================================
   *  PUT /api/v1/transactions/:id/status
   * =====================================================
   *  - Met à jour le statut d’une transaction
   */
  app.put("/api/v1/transactions/:id/status", auth, async (req, res) => {
    try {
      const { status, status_reason } = req.body;
      const validStatuses = [
        "pending",
        "processing",
        "success",
        "failed",
        "refunded",
      ];

      if (!validStatuses.includes(status)) {
        return res
          .status(400)
          .json({ success: false, message: "Statut invalide." });
      }

      const transaction = await Transaction.findByPk(req.params.id);
      if (!transaction) {
        return res
          .status(404)
          .json({ success: false, message: "Transaction non trouvée." });
      }

      transaction.status = status;
      transaction.status_reason = status_reason || null;
      await transaction.save();

      res.status(200).json({
        success: true,
        message: "Statut de la transaction mis à jour avec succès.",
        data: transaction,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la mise à jour du statut.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  DELETE /api/v1/transactions/:id
   * =====================================================
   *  - Supprime une transaction
   */
  app.delete("/api/v1/transactions/:id", auth, async (req, res) => {
    try {
      const transaction = await Transaction.findByPk(req.params.id);
      if (!transaction) {
        return res
          .status(404)
          .json({ success: false, message: "Transaction non trouvée." });
      }

      await transaction.destroy();
      res.status(200).json({
        success: true,
        message: "Transaction supprimée avec succès.",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la suppression.",
        data: error.message,
      });
    }
  });
};
