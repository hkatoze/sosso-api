const db = require("../db/sequelize");
const { User, Device } = db.models;
const { ValidationError, Op } = require("sequelize");
const auth = require("../auth/auth");

module.exports = (app) => {
  app.post("/api/v1/users/register", auth, async (req, res) => {
    const { device_uid, phone } = req.body;

    if (!device_uid || !phone) {
      return res
        .status(400)
        .json({ success: false, message: "device_uid et phone sont requis." });
    }

    try {
      // Vérifie si ce numéro existe déjà
      let existingUser = await User.findOne({ where: { phone } });
      if (existingUser) {
        return res
          .status(409)
          .json({ success: false, message: "Ce numéro est déjà enregistré." });
      }

      // Cherche le device (lié à un utilisateur anonyme)
      const device = await Device.findOne({
        where: { device_uid },
        include: [{ model: User, as: "user" }],
      });

      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device non trouvé. Impossible d'enregistrer l'utilisateur.",
        });
      }

      const user = device.user;
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "Aucun utilisateur associé à ce device.",
        });
      }

      // Met à jour les infos utilisateur
      user.phone = phone;
      user.is_anonymous = false;
      user.verified = true;
      await user.save();

      return res.status(200).json({
        success: true,
        message: "Utilisateur enregistré avec succès.",
        data: { user },
      });
    } catch (error) {
      console.error("Erreur /register :", error);
      if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, message: error.message });
      }
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de l'enregistrement de l'utilisateur.",
        data: error.message,
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
