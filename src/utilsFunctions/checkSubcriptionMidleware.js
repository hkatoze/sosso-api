const { UserSubscription } = require("../db/sequelize");

async function checkActiveSubscription(req, res, next) {
  const userId = req.user.id;

  const subscription = await UserSubscription.findOne({
    where: {
      userId: userId,
      status: "active",
    },
    order: [["endDate", "DESC"]],
  });

  if (!subscription || new Date() > subscription.endDate) {
    return res.status(403).json({
      message: "Votre abonnement a expiré. Veuillez renouveler pour continuer.",
    });
  }

  next();
}

module.exports = checkActiveSubscription;
