const { Op } = require("sequelize");
const { UserSubscription } = require("../db/sequelize");
const { default: sequelize } = require("sequelize/lib/sequelize");

async function updateExpiredSubscriptions() {
  console.log(
    "Vérification des abonnements expirés à:",
    new Date().toLocaleString()
  );

  // Met à jour les abonnements actifs avec des jours restants
  await UserSubscription.update(
    {
      daysRemaining: sequelize.literal("daysRemaining - 1"), // Décrémente daysRemaining de 1
    },
    {
      where: {
        daysRemaining: { [Op.gt]: 0 }, // Seuls les abonnements avec jours restants
      },
    }
  );

  // Marque les abonnements comme expirés si daysRemaining atteint 0
  await UserSubscription.update(
    { planAbonnement: 0 },
    {
      where: {
        daysRemaining: 0,
      },
    }
  );

  console.log("Mise à jour des abonnements expirés terminée.");
}
module.exports = updateExpiredSubscriptions;
