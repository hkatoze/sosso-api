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
    // 1. Récupérer le device
    let device = await Device.findOne({
      where: { device_uid },
      include: [{ model: User, as: "user" }]
    });

    // 2. Cas : device inconnu → nouveau téléphone
    if (!device) {
      // On cherche l'utilisateur par téléphone
      const existingUser = await User.findOne({ where: { phone } });

      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: "Utilisateur introuvable pour ce numéro."
        });
      }

      // On crée un nouveau device lié à cet user
      device = await Device.create({
        device_uid,
        userId: existingUser.id
      });

      return res.status(200).json({
        success: true,
        message: "Connexion réussie (nouveau appareil).",
        data: { user: existingUser }
      });
    }

    // 3. Le device existe. On récupère l’utilisateur
    let user = device.user;

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Aucun utilisateur associé à ce device."
      });
    }

    // 4. Cas : utilisateur anonyme → on l’enregistre
    if (user.is_anonymous === true) {
      user.phone = phone;
      user.is_anonymous = false;
      user.verified = true;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Utilisateur enregistré avec succès.",
        data: { user }
      });
    }

    // 5. Cas : utilisateur déjà enregistré → simple connexion
    return res.status(200).json({
      success: true,
      message: "Connexion réussie.",
      data: { user }
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
