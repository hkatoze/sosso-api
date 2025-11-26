const db = require("../db/sequelize");
const { OperatorFee, PlatformFee } = db.models;
const auth = require("../auth/auth");
const { Op } = require("sequelize");

module.exports = (app) => {
  app.post("/api/v1/fees/calculate", auth, async (req, res) => {
    const { from_operator_id, to_operator_id, amount } = req.body;

    if (!from_operator_id || !to_operator_id || !amount) {
      return res.status(400).json({
        success: false,
        message: "from_operator_id, to_operator_id et amount sont obligatoires."
      });
    }

    try {
      // 1. Récupération du fee opérateur
      const opFee = await OperatorFee.findOne({
        where: { from_operator_id, to_operator_id }
      });

      if (!opFee) {
        return res.status(404).json({
          success: false,
          message: "Aucun fee opérateur trouvé pour cette direction."
        });
      }

      // 2. Récupération du fee plateforme (première ligne)
      const platformFee = await PlatformFee.findOne();

      if (!platformFee) {
        return res.status(500).json({
          success: false,
          message: "Les frais de plateforme ne sont pas configurés."
        });
      }

      // 3. Calculs
      const operator_fee_amount =
        parseFloat(opFee.fee_fixed) +
        (amount * (opFee.fee_percent / 100));

      const platform_fee_amount =
        parseFloat(platformFee.fee_fixed) +
        (amount * (platformFee.fee_percent / 100));

      const total_fee = operator_fee_amount + platform_fee_amount;

      return res.status(200).json({
        success: true,
        message: "Frais calculés avec succès.",
        data: {
          rules: {
            operator_fee: opFee,
            platform_fee: platformFee
          },
          amounts: {
            operator_fee_amount,
            platform_fee_amount,
            total_fee
          }
        }
      });
    } catch (error) {
      console.error("Erreur calcul frais :", error);
      res.status(500).json({
        success: false,
        message: "Erreur lors du calcul des frais.",
        data: error.message
      });
    }
  });
};
