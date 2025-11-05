const { Transaction, User, Operator, Device, ApiProvider } =
  require("../db/sequelize").models;
const { ValidationError, Op } = require("sequelize");
const auth = require("../auth/auth");
const { v4: uuidv4 } = require("uuid");
const afri = require("../routes/afribapayEndpoints");
const { triggerPayout } = require("../utilsFunctions/transactionsTrigger");
module.exports = (app) => {
  // Étape 1: INITIER un transfert (PAYIN)
  app.post("/api/v1/transactions/initiate", async (req, res) => {
    try {
      const {
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
      const reference = "TX-" + uuidv4().slice(0, 8).toUpperCase();

      // 1️⃣ Créer la transaction locale (status = pending)
      const transaction = await Transaction.create({
        reference,
        sender_operator_id,
        receiver_operator_id,
        sender_phone,
        receiver_phone,
        amount,
        status: "pending",
      });

      // 2️⃣ Appeler AfribaPAY → PAYIN
      const payinPayload = {
        operator: senderOperator.short_code, // ex: "orange"
        country: "BF",
        phone_number: sender_phone,
        amount: parseFloat(amount),
        currency: "XOF",
        order_id: reference,
        merchant_key: process.env.AFRIBAPAY_MERCHANT_KEY,
        reference_id: reference,
        lang: "fr",
        return_url: process.env.AFRIBAPAY_RETURN_URL,
        cancel_url: process.env.AFRIBAPAY_CANCEL_URL,
        notify_url: process.env.AFRIBAPAY_WEBHOOK_URL,
      };

      const result = await afri.createPayin(payinPayload);

      if (!result.success) {
        transaction.status = "failed";
        await transaction.save();
        return res.status(500).json({
          success: false,
          message: "Échec du PAYIN via AfribaPAY",
          error: result.message,
        });
      }

      // 3️⃣ Mise à jour transaction locale avec les infos AfribaPAY
      await transaction.update({
        provider_reference: result.data.transaction_id,
        metadata: result.data,
        status: "processing",
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

  app.post("/api/v1/transactions/complete", async (req, res) => {
    try {
      const { reference } = req.body;
      if (!reference)
        return res
          .status(400)
          .json({ success: false, message: "Référence manquante." });

      const transaction = await Transaction.findOne({ where: { reference } });
      if (!transaction)
        return res
          .status(404)
          .json({ success: false, message: "Transaction introuvable." });

      if (transaction.status !== "success_payin") {
        return res.status(400).json({
          success: false,
          message: "Le PAYIN doit être validé avant le PAYOUT.",
        });
      }

      // Récupérer opérateur du receveur
      const receiverOperator = await Operator.findByPk(
        transaction.receiver_operator_id
      );

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
        return res.status(500).json({
          success: false,
          message: "Échec du PAYOUT.",
          data: result.message,
        });
      }

      await transaction.update({
        status: "processing_payout",
        provider_reference: result.data.transaction_id,
        metadata: result.data,
      });

      return res.status(200).json({
        success: true,
        message: "PAYOUT initié avec succès.",
        data: result.data,
      });
    } catch (error) {
      console.error("Erreur /transactions/complete:", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors du PAYOUT.",
        data: error.message,
      });
    }
  });

  app.post(
    "/api/v1/afribapay/webhook",
    require("body-parser").raw({ type: "application/json" }),
    async (req, res) => {
      try {
        const signature = req.headers["afribapay-sign"];
        const raw = req.body.toString("utf-8");
        const verified = afri.verifyWebhookSignature(
          raw,
          process.env.AFRIBAPAY_API_TOKEN,
          signature
        );

        if (!verified) return res.status(403).send("Invalid signature");

        const payload = JSON.parse(raw);
        const { order_id, status } = payload;
        console.log("[AFRIBAPAY] Webhook reçu:", order_id, status);

        const transaction = await Transaction.findOne({
          where: { reference: order_id },
        });

        if (!transaction)
          return res.status(404).send("Transaction non trouvée");

        // 1️⃣ Màj du statut local
        await transaction.update({
          status: status.toLowerCase(),
          metadata: payload,
        });

        // 2️⃣ Si c'est un succès PAYIN → lancer automatiquement le PAYOUT
        if (status === "SUCCESS" && !order_id.endsWith("-OUT")) {
          console.log(
            "[AFRIBAPAY] PAYIN réussi. Déclenchement automatique du PAYOUT…"
          );
          await triggerPayout(transaction);
        }

        return res.status(200).send("OK");
      } catch (err) {
        console.error("Erreur webhook:", err);
        return res.status(500).send("Erreur serveur");
      }
    }
  );
  /**
   * =====================================================
   *  POST /api/v1/transactions
   * =====================================================
   *  - Crée une nouvelle transaction
   */
  app.post("/api/v1/transactions", auth, async (req, res) => {
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
          message:
            "Champs obligatoires manquants : sender_operator_id, receiver_operator_id, sender_phone, receiver_phone, amount.",
        });
      }

      const fees = parseFloat(amount) * 0.01; // 1% pour l’instant
      const amount_received = parseFloat(amount) - fees;
      const reference = "TX-" + uuidv4().slice(0, 8).toUpperCase();

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

      return res.status(201).json({
        success: true,
        message: "Transaction créée avec succès.",
        data: transaction,
      });
    } catch (error) {
      console.error("Erreur /transactions POST:", error);
      if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la création de la transaction.",
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
      const transactions = await Transaction.findAll({
        where: { user_id: req.params.userId },
        include: [
          { model: Operator, as: "senderOperator" },
          { model: Operator, as: "receiverOperator" },
        ],
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        success: true,
        message: "Transactions de l'utilisateur récupérées avec succès.",
        data: transactions,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Erreur serveur lors de la récupération des transactions utilisateur.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/transactions/device/:deviceId
   * =====================================================
   *  - Transactions liées à un appareil (utilisateur anonyme)
   */
  app.get("/api/v1/transactions/device/:deviceId", auth, async (req, res) => {
    try {
      const transactions = await Transaction.findAll({
        where: { device_id: req.params.deviceId },
        include: [
          { model: Operator, as: "senderOperator" },
          { model: Operator, as: "receiverOperator" },
        ],
        order: [["createdAt", "DESC"]],
      });
      if (!transactions || transactions.length === 0) {
        return res.status(200).json({
          success: true,
          message: "Aucune transacation trouvée.",
          data: [],
        });
      }
      res.status(200).json({
        success: true,
        message: "Transactions du device récupérées avec succès.",
        data: transactions,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Erreur serveur lors de la récupération des transactions device.",
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
