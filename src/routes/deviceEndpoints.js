const db = require("../db/sequelize");
const { Device, User } = db.models;
const { ValidationError } = require("sequelize");
const auth = require("../auth/auth");
module.exports = (app) => {
  app.post("/api/v1/devices/register", auth, async (req, res) => {
    const { device_uid, os } = req.body;

    if (!device_uid) {
      return res.status(400).json({ message: "device_uid requis" });
    }

    try {
      let device = await Device.findOne({ where: { device_uid } });
      let user;

      if (!device) {
        //Crée un utilisateur anonyme
        user = await User.create({
          is_anonymous: true,
          verified: false,
        });

        //Crée le device lié à ce user
        device = await Device.create({
          device_uid,
          os,
          user_id: user.id,
        });
        return res.status(201).json({
          success: true,
          message: "Nouvelle connexion anonyme reussi.",
          data: { device, user },
        });
      }

      // Si le device existe déjà → on met à jour les infos
      device.os = os || device.os;
      await device.save();
      // Récupère le user associé
      user = await User.findByPk(device.user_id);

      return res.status(200).json({
        success: true,
        message: "Connexion reconnue avec succès.",
        data: { device, user },
      });
    } catch (error) {
      console.error("Erreur de connexion :", error);

      if (error instanceof ValidationError) {
        return res.status(400).json({ message: error.message });
      }

      res.status(500).json({
        success: false,
        message: "Erreur interne lors de la création du device",
        data: error.message,
      });
    }
  });

  app.get("/api/v1/devices/:device_uid", auth, async (req, res) => {
    const { device_uid } = req.params;

    try {
      const device = await Device.findOne({
        where: { device_uid },
        include: [{ model: User, as: "user" }],
      });

      if (!device) {
        return res
          .status(404)
          .json({ success: false, message: "Device introuvable." });
      }

      return res.status(200).json({
        success: true,
        message: "Device récupéré avec succès.",
        data: device,
      });
    } catch (error) {
      console.error("Erreur :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération du device",
        data: error.message,
      });
    }
  });
};
