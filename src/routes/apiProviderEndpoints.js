const { ApiProvider, Transaction } = require("../db/sequelize").models;
const { ValidationError } = require("sequelize");
const auth = require("../auth/auth");

module.exports = (app) => {
  /**
   * =====================================================
   *  POST /api/v1/api-providers
   * =====================================================
   *  - Crée un nouveau fournisseur d'API
   */
  app.post("/api/v1/api-providers", auth, async (req, res) => {
    try {
      const { name, base_url, api_key, fee_policy, metadata } = req.body;

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Le nom du fournisseur est requis.",
        });
      }

      const existing = await ApiProvider.findOne({ where: { name } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "Ce fournisseur existe déjà.",
        });
      }

      const provider = await ApiProvider.create({
        name,
        base_url,
        api_key,
        fee_policy,
        metadata,
        active: true,
      });

      res.status(201).json({
        success: true,
        message: "Fournisseur d'API créé avec succès.",
        data: provider,
      });
    } catch (error) {
      console.error("Erreur /api-providers POST :", error);
      if (error instanceof ValidationError) {
        return res.status(400).json({ success: false, message: error.message });
      }
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la création du fournisseur.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/api-providers
   * =====================================================
   *  - Liste tous les fournisseurs actifs
   *  - Option : ?all=true pour inclure les inactifs
   */
  app.get("/api/v1/api-providers", auth, async (req, res) => {
    try {
      const includeInactive = req.query.all === "true";
      const whereClause = includeInactive ? {} : { active: true };

      const providers = await ApiProvider.findAll({
        where: whereClause,
        order: [["name", "ASC"]],
      });

      res.status(200).json({
        success: true,
        message: includeInactive
          ? "Liste complète des fournisseurs récupérée avec succès."
          : "Liste des fournisseurs actifs récupérée avec succès.",
        data: providers,
      });
    } catch (error) {
      console.error("Erreur /api-providers GET :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des fournisseurs.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/api-providers/:id
   * =====================================================
   *  - Récupère un fournisseur précis
   */
  app.get("/api/v1/api-providers/:id", auth, async (req, res) => {
    try {
      const provider = await ApiProvider.findByPk(req.params.id, {
        include: [{ model: Transaction, as: "transactions" }],
      });

      if (!provider) {
        return res.status(404).json({
          success: false,
          message: "Fournisseur non trouvé.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Fournisseur récupéré avec succès.",
        data: provider,
      });
    } catch (error) {
      console.error("Erreur /api-providers/:id GET :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération du fournisseur.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  PUT /api/v1/api-providers/:id
   * =====================================================
   *  - Met à jour un fournisseur existant
   */
  app.put("/api/v1/api-providers/:id", auth, async (req, res) => {
    try {
      const { name, base_url, api_key, fee_policy, active, metadata } = req.body;

      const provider = await ApiProvider.findByPk(req.params.id);
      if (!provider) {
        return res.status(404).json({
          success: false,
          message: "Fournisseur non trouvé.",
        });
      }

      // Vérifie que le nouveau nom n’est pas déjà utilisé par un autre provider
      if (name && name !== provider.name) {
        const existing = await ApiProvider.findOne({ where: { name } });
        if (existing) {
          return res.status(409).json({
            success: false,
            message: "Un fournisseur avec ce nom existe déjà.",
          });
        }
        provider.name = name;
      }

      provider.base_url = base_url ?? provider.base_url;
      provider.api_key = api_key ?? provider.api_key;
      provider.fee_policy = fee_policy ?? provider.fee_policy;
      provider.active = active ?? provider.active;
      provider.metadata = metadata ?? provider.metadata;

      await provider.save();

      res.status(200).json({
        success: true,
        message: "Fournisseur mis à jour avec succès.",
        data: provider,
      });
    } catch (error) {
      console.error("Erreur /api-providers PUT :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la mise à jour du fournisseur.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  DELETE /api/v1/api-providers/:id
   * =====================================================
   *  - Supprime un fournisseur
   */
  app.delete("/api/v1/api-providers/:id", auth, async (req, res) => {
    try {
      const provider = await ApiProvider.findByPk(req.params.id);
      if (!provider) {
        return res.status(404).json({
          success: false,
          message: "Fournisseur non trouvé.",
        });
      }

      await provider.destroy();

      res.status(200).json({
        success: true,
        message: "Fournisseur supprimé avec succès.",
      });
    } catch (error) {
      console.error("Erreur /api-providers DELETE :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la suppression du fournisseur.",
        data: error.message,
      });
    }
  });
};
