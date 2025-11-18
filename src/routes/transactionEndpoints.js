
const { Transaction, User, Operator, Device, ApiProvider } =
  require("../db/sequelize").models;
const { ValidationError, Op } = require("sequelize");
const auth = require("../auth/auth");
const { v4: uuidv4 } = require("uuid");
const afri = require("../routes/merchandApiEndpoints");
const { triggerPayout } = require("../utilsFunctions/transactionsTrigger");
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

      console.log("DONNEES RECUS:"+ req.body)
      // Récupérer les opérateurs
      const senderOperator = await Operator.findByPk(sender_operator_id);
      const receiverOperator = await Operator.findByPk(receiver_operator_id);

      if (!senderOperator || !receiverOperator) {
        return res
          .status(404)
          .json({ success: false, message: "Opérateur introuvable." });
      }

      // Créer une référence unique
      const reference = "TX-"+user_id+"-" + uuidv4().slice(0, 8).toUpperCase()+ "-IN";
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
                phoneNumber: sender_phone,
                provider: senderOperator.short_code
            }
        }
       
      };

      const result = await afri.createPayin(payinPayload);

      if (!result.success) {
        transaction.status = "failed";
        await transaction.save();
        return res.status(500).json({
          success: false,
          message: "Échec du PAYIN",
          error: result.message,
        });
      }

      // 3️⃣ Mise à jour transaction locale avec les infos AfribaPAY
      await transaction.update({
        provider_reference: result.data.providerTransactionId,
        metadata: result.data,
        status: "processing_payin",
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

      // 4 Ecouter le Rappel
      const { depositId, status,providerTransactionId} = req.body;

      const reference= depositId;
      if (!reference)
        return res
          .status(400)
          .json({ success: false, message: "Référence manquante." });

      const transaction = await Transaction.findOne({ where: { reference } });
      if (!transaction)
        return res
          .status(404)
          .json({ success: false, message: "Transaction introuvable." });

      if (status !== "COMPLETED") {
        return res.status(400).json({
          success: false,
          message: "Le PAYIN non aboutit.",
        });
      }

      await transaction.update({
        status: "success_payin",
        provider_reference: providerTransactionId,
      });

    // 5 Appeler  PAYOUT
      const receiverOperator = await Operator.findByPk(
        transaction.receiver_operator_id
      );

      const payoutPayload = {
        payoutId: transaction.reference + "-OUT",
        amount: parseFloat(transaction.amount).toString(),
        currency: "XOF",
        recipient:{
          type: "MMO",
            accountDetails: {
                phoneNumber: transaction.receiver_phone,
                provider: receiverOperator.short_code
            }
        }
      
      };

      const result = await afri.createPayout(payoutPayload);

      if (!result.success) {
        await transaction.update({
          status: "success_payin_failed_payout",
          metadata: result.data,
        });
        return res.status(500).json({
          success: false,
          message: "Échec du PAYOUT.",
          data: result.message,
        });
      }

      await transaction.update({
        status: "success_payin_processing_payout",
        provider_reference: result.data.providerTransactionId,
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



app.post("/api/v1/transactions/complete/payout", async (req, res) => {
    try {

      // 4 Ecouter le Rappel
      const { payoutId, status,providerTransactionId} = req.body;

      const reference= payoutId;
      if (!reference)
        return res
          .status(400)
          .json({ success: false, message: "Référence manquante." });

      const transaction = await Transaction.findOne({ where: { reference } });
      if (!transaction)
        return res
          .status(404)
          .json({ success: false, message: "Transaction introuvable." });

      if (status !== "COMPLETED") {
        return res.status(400).json({
          success: false,
          message: "Echec de PAYOUT",
        });
      }

      await transaction.update({
        status: "success_payin_success_payout",
        provider_reference: transaction.id,
      });

      return res.status(200).json({
        success: true,
        message: "Payin & Payout réussie",
        data: transaction,
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
