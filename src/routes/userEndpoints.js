const db = require("../db/sequelize");
const { User, Device } = db.models;
const {
  generateVerificationCode,
} = require("../utilsFunctions/generateVerificationCode");
const {
  sendVerificationCode,
} = require("../utilsFunctions/sendVerificationCode");
const { ValidationError, Op } = require("sequelize");

const auth = require("../auth/auth");

module.exports = (app) => {
  app.post("/api/v1/users/otp", auth, async (req, res) => {
    const { phone } = req.body;

    if (!phone) {
      return res
        .status(400)
        .json({ success: false, message: "phone sont requis." });
    }

    try {
      // Génération d'un code de vérification unique
      const verificationCode = generateVerificationCode();
      // Envoi du code de vérification par téléphone
      await sendVerificationCode(phone, verificationCode);

      return res.status(200).json({
        success: true,
        message: "Code OTP généré avec succès.",
        data: verificationCode,
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, message: error.message });
      }
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la génération du code OTP.",
        data: error.message,
      });
    }
  });
app.post("/api/v1/users/register", auth, async (req, res) => {
  const { device_uid, phone } = req.body;

  if (!device_uid || !phone) {
    return res.status(400).json({
      success: false,
      message: "device_uid et phone sont requis."
    });
  }

  try {
    // 1️⃣ Vérifier si le device existe (créé par un autre endpoint)
    let device = await Device.findOne({
      where: { id: device_uid }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: "Ce device n'existe pas. Il doit être créé avant."
      });
    }

    // 2️⃣ Chercher un utilisateur avec ce phone
    let user = await User.findOne({ where: { phone } });

    // 3️⃣ Si l'utilisateur n'existe pas → on le crée
    if (!user) {
      user = await User.create({
        phone,
        is_anonymous: false,
        verified: true
      });
    }

    // 4️⃣ Associer ce device au user si ce n'est pas déjà fait
    if (device.userId !== user.id) {
      device.userId = user.id;
       device.user_phone = user.phone;
      await device.save();
    }

    // 5️⃣ Réassigner toutes les transactions du device (qui étaient anonymes)
    await Transaction.update(
      { user_id: user.id },
      {
        where: {
          device_id: device.id,
          user_id: null   // uniquement celles qui étaient anonymes
        }
      }
    );

    // 6️⃣ Réponse finale
    return res.status(200).json({
      success: true,
      message: "Opération réussie.",
      data: { device }
    });

  } catch (error) {
    console.error("Erreur /register :", error);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur.",
      data: error.message
    });
  }
});



  app.get("/api/v1/users/:id", auth, async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id, {
        include: [{ model: Device, as: "devices" }],
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "Utilisateur non trouvé." });
      }

      res.status(200).json({
        success: true,
        message: "Utilisateur récupéré avec succès.",
        data: user,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération.",
        data: error.message,
      });
    }
  });

  app.put("/api/v1/users/:id", auth, async (req, res) => {
    const { name, phone } = req.body;

    try {
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "Utilisateur non trouvé." });
      }

      // Vérifie si le nouveau numéro n’appartient pas à quelqu’un d’autre
      if (phone) {
        const existing = await User.findOne({
          where: { phone, id: { [Op.ne]: user.id } },
        });
        if (existing) {
          return res
            .status(409)
            .json({ success: false, message: "Ce numéro est déjà utilisé." });
        }
        user.phone = phone;
      }

      if (name) user.name = name;
      await user.save();

      res.status(200).json({
        success: true,
        message: "Profil mis à jour avec succès.",
        data: user,
      });
    } catch (error) {
      console.error("Erreur /update :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la mise à jour du profil.",
        data: error.message,
      });
    }
  });

  app.delete("/api/v1/users/:id", auth, async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id);
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "Utilisateur non trouvé." });
      }

      await user.destroy();
      res
        .status(200)
        .json({ success: true, message: `Utilisateur supprimé avec succès.` });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la suppression.",
        data: error.message,
      });
    }
  });

  app.get("/api/v1/users", auth, async (req, res) => {
    try {
      const users = await User.findAll({
        attributes: ["id", "phone", "name", "is_anonymous", "verified"],
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        success: true,
        message: "Liste des utilisateurs récupérée avec succès.",
        data: users,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des utilisateurs.",
        data: error.message,
      });
    }
  });
};
