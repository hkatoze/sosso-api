
const { Transaction, User, Operator, Device, ApiProvider } =
  require("../db/sequelize").models;
const { ValidationError, Op } = require("sequelize");
const auth = require("../auth/auth");
const { v4: uuidv4 } = require("uuid");
const pawapay = require("../routes/pawapay/pawapayControllers");
const ligdicash = require("../routes/ligdicash/ligdiControllers");
const { matchingOperator } = require("../utilsFunctions/matchingOperator");
const AGGREGATOR_USED= 'ligdicash';

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
        otp,
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

      // 2️⃣ Appeler  PAYIN
      const payinPayload = {
        commande: {
          invoice: {
            items: [
              {
                name: "Transfert mobile",
                quantity: 1,
                unit_price: parseFloat(amount),
                total_price: parseFloat(amount),
              },
            ],
            total_amount: parseFloat(amount),
            devise: "XOF",
            customer: "226" + sender_phone,
            external_id: "",
            otp: otp,
          },
          store: {
            name: "Sosso",
            website_url: "https://www.sosso.kuurasys.com",
          },
          actions: {
            cancel_url:
              "https://sosso-api.onrender.com/api/v1/transactions/complete/payin",
            return_url:
              "https://sosso-api.onrender.com/api/v1/transactions/complete/payin",
            callback_url:
              "https://sosso-api.onrender.com/api/v1/transactions/complete/payin",
          },
          custom_data: {
            transaction_id: reference,
            order_id: reference,
          },
        },
      };

      const result =
        await ligdicash.createLigdiPayinWithOTP(payinPayload);
      console.log(result);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          message: "Aggregator failed",
          error: result.message,
        });
      }

      if (result.data.response_code == "01") {
           return res.status(500).json({
             success: true,
             message: "PAYIN failed.",
             data: result.data,
           });
         }
      // 1️⃣ Créer la transaction locale (status = pending)
         await Transaction.create({
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
        status: "processing_payin",
        provider_reference: result.data.providerTransactionId,
        metadata: result.data,
        transaction_datetime: new Date(),
      });

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
    const { transaction_id, status } = req.body;
    const reference = transaction_id;

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
    const alreadyProcessed = ["success_payin", "success_payin_processing_payout", "success_payin_failed_payout", "success_payin_success_payout",]
      .includes(transaction.status);
    if (alreadyProcessed) {
      console.log("Callback reçu pour transaction déjà traitée:", transaction.reference, transaction.status);
      return res.status(200).json({ success: true, message: "Already processed", data: { status: transaction.status } });
    }

    const s = (status || "").toString().toUpperCase().trim();

    switch (s) {
      case "ACCEPTED":
        console.log("PAYIN", s);

        return res.status(200).json({ success: true, message: "PAYIN " + s });
      case "SUBMITTED":
        console.log("PAYIN", s);
        return res.status(200).json({ success: false, message: "PAYIN " + s });
      case "FAILED":
        console.log("PAYIN", s);
        await transaction.update({
          status: "payin_failed",
        });
        return res.status(500).json({ success: false, message: "PAYIN " + s });
      case "REJECTED":
        console.log("PAYIN", s);
        await transaction.update({
          status: "payin_failed",
        });
        return res.status(500).json({ success: false, message: "PAYIN " + s });

      case "NOCOMPLETED":
        console.log("PAYIN", s);
        await transaction.update({
          status: "payin_failed",
        });
        return res.status(500).json({ success: false, message: "PAYIN " + s });
      case "PENDING":
        console.log("PENDING_PAYIN.");
        return res.status(201).json({ success: true, message: "PAYIN " + s });
      case "COMPLETED":
        console.log("SUCCESS_PAYIN.");
        await transaction.update({
          status: "success_payin_processing_payout",
        });

        break; // continuer pour déclencher le payout
      default:
        console.warn("Statut PAYIN inconnu:", status);
        return res
          .status(400)
          .json({ success: false, message: "Statut inconnu: " + status });
    }

    // --- créer le PAYOUT (après "COMPLETED")
    const receiverOperator = await Operator.findByPk(transaction.receiver_operator_id);

    const payoutPayload =
     {
            commande: {
              amount: parseFloat(transaction.amount),
              description: "Transfert mobile",
              customer: "226" + transaction.receiver_phone,
              custom_data: {
                transaction_id: transaction.reference,
              },
              callback_url:
                "https://sosso-api.onrender.com/api/v1/transactions/complete/payout",
            },
          };

    const result =  await ligdicash.createLigdiPayout(payoutPayload);

   

        if (!result || !result.success) {
      console.log(
        "Aggregator failed.",
        result && result.message && result.response_text
      );
      await transaction.update({
        status: "success_payin_failed_payout",

      });
      return res.status(500).json({
        success: false,
        message: "Aggregator failed.",
        data: result ? result.message : "No result from payout",
      });
    }
 
    
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
    const { transaction_id, status } =
      req.body;
    const reference =  transaction_id;

    if (!reference) {
      console.log("Référence manquante.");
      return res
        .status(400)
        .json({ success: false, message: "Référence manquante." });
    }

    const transaction = await Transaction.findOne({
      where: { reference: reference.toUpperCase() },
    });
    if (!transaction) {
      console.log("Transaction introuvable.");
      return res
        .status(404)
        .json({ success: false, message: "Transaction introuvable." });
    }

    // idempotence : si déjà finalisé comme success_payin_success_payout, ack
    if (transaction.status === "success_payin_success_payout") {
      console.log(
        "Payout callback pour transaction déjà finalisée:",
        transaction.reference
      );
      return res
        .status(200)
        .json({
          success: true,
          message: "Already finalized",
          data: transaction,
        });
    }
const s = (status || "").toString().toUpperCase().trim();

switch (s) {
  case "ACCEPTED":
    console.log("PAYOUT ACCEPTED");
    return res.status(200).json({ success: true, message: "PAYOUT ACCEPTED" });

  case "SUBMITTED":
    console.log("PAYOUT", s);
    return res.status(200).json({ success: false, message: "PAYOUT " + s });
  case "ENQUEUED":
    console.log("PAYOUT", s);
    return res.status(200).json({ success: false, message: "PAYOUT " + s });
  case "NOCOMPLETED":
  case "FAILED":
  case "REJECTED":
    console.log("PAYOUT FAILED → Lancement du remboursement…");
    await transaction.update({
      status: "success_payin_failed_payout",
    });
    // --- REMBOURSEMENT ---
    const refundReference = uuidv4().slice(0, 36).toUpperCase();

    const refundPayload =
     {
            commande: {
              amount: parseFloat(transaction.amount),
              description: "Transfert mobile-Remboursement",
              customer: "226" + transaction.sender_phone,
              custom_data: { transaction_id: transaction.reference },
              callback_url:
                "https://sosso-api.onrender.com/api/v1/transactions/complete/refund",
            },
          };

    const refundResult = await ligdicash.createLigdiRefund(refundPayload);

    if (!refundResult || !refundResult.success) {
      console.log("Refund failed");
      await transaction.update({
        status: "success_payin_failed_payout_failed_refund",
      });
      return res.status(500).json({
        success: false,
        message: "Refund failed",
        data: refundResult || null,
      });
    }
    await transaction.update({
      reference: refundReference,
    });
    console.log("Refund initiated successfully");
    await transaction.update({
      status: "success_payin_failed_payout_processing_refund",
    });

    return res.status(200).json({
      success: false,
      message: "PAYOUT failed → REFUND initiated",
      data: refundResult,
    });

  case "COMPLETED":
    console.log("SUCCESS_PAYIN_SUCCESS_PAYOUT");
    await transaction.update({
      status: "success_payin_success_payout",
    });
    return res.status(200).json({
      success: true,
      message: "Payin & Payout réussie",
      data: transaction,
    });

  default:
    console.warn("Statut PAYOUT inconnu:", status);
    return res.status(400).json({
      success: false,
      message: "Statut inconnu: " + status,
    });
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
  try {
    const { transaction_id, status } =
      req.body;
    const reference = transaction_id;

    if (!reference) {
      console.log("Référence manquante.");
      return res
        .status(400)
        .json({ success: false, message: "Référence manquante." });
    }

    console.log("REFERENCE RECU:", reference);
    const transaction = await Transaction.findOne({
      where: { reference: reference.toUpperCase() },
    });

    if (!transaction) {
      console.log("Transaction introuvable.");
      return res
        .status(404)
        .json({ success: false, message: "Transaction introuvable." });
    }

    // Idempotence : si le refund est déjà finalisé, OK
    if (
      [
        "success_payin_failed_payout_success_refund",
        "success_payin_failed_payout_failed_refund",
      ].includes(transaction.status)
    ) {
      return res.status(200).json({
        success: true,
        message: "Refund already processed",
        data: { status: transaction.status },
      });
    }

    const s = (status || "").toString().toUpperCase().trim();

    switch (s) {
      case "ACCEPTED":
        console.log("REFUND ACCEPTED");

        return res
          .status(200)
          .json({ success: true, message: "REFUND ACCEPTED" });

      case "REJECTED":
      case "FAILED":
      case "NOCOMPLETED":
        console.log("REFUND FAILED:", s);
        await transaction.update({
          status: "success_payin_failed_payout_failed_refund",
     
        });
        return res
          .status(500)
          .json({ success: false, message: "REFUND FAILED" });

      case "COMPLETED":
        console.log("REFUND COMPLETED.");
        await transaction.update({
          status: "success_payin_failed_payout_success_refund",
        });
        return res
          .status(200)
          .json({ success: true, message: "REFUND COMPLETED" });

      default:
        console.warn("Statut REFUND inconnu:", status);
        return res
          .status(400)
          .json({ success: false, message: "Statut inconnu: " + status });
    }
  } catch (error) {
    console.error("Erreur /transactions/complete/refund:", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors du traitement du refund.",
      data: error.message,
    });
  }
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
