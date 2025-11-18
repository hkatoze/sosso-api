const db = require("../db/sequelize");
const { Operator } = db.models;
const { ValidationError } = require("sequelize");
const auth = require("../auth/auth");

module.exports = (app) => {
  /**
   * =====================================================
   *  POST /api/v1/operators
   * =====================================================
   *  - Crée un nouvel opérateur
   */
  app.post("/api/v1/operators", auth, async (req, res) => {
    const { name, short_code, logo_url, country, active, metadata } = req.body;

    if (!name || !short_code) {
      return res.status(400).json({
        success: false,
        message: "Les champs 'name' et 'short_code' sont requis.",
      });
    }

    try {
      const existing = await Operator.findOne({ where: { short_code } });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "Ce code d’opérateur existe déjà.",
        });
      }

      const operator = await Operator.create({
        name,
        short_code,
        logo_url,
        country,
        active,
        metadata,
      });

      res.status(201).json({
        success: true,
        message: "Nouvel opérateur ajouté avec succès.",
        data: operator,
      });
    } catch (error) {
      console.error("Erreur /operators POST :", error);
      const status = error instanceof ValidationError ? 400 : 500;
      res.status(status).json({
        success: false,
        message:
          status === 400
            ? error.message
            : "Erreur serveur lors de la création de l’opérateur.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/operators
   * =====================================================
   *  - Liste de tous les opérateurs
   */
  app.get("/api/v1/operators", auth, async (req, res) => {
    try {
      // Si ?all=true est présent, on récupère tous les opérateurs
      const includeInactive = req.query.all == true;
      const whereClause = includeInactive ? {} : { active: true };

      const operators = await Operator.findAll({
        where: whereClause,
        order: [["name", "ASC"]],
      });

      if (!operators || operators.length === 0) {
        return res.status(200).json({
          success: true,
          message: includeInactive
            ? "Aucun opérateur trouvé."
            : "Aucun opérateur actif trouvé.",
          data: [],
        });
      }

      res.status(200).json({
        success: true,
        message: includeInactive
          ? "Liste complète des opérateurs récupérée avec succès."
          : "Liste des opérateurs actifs récupérée avec succès.",
        data: operators,
      });
    } catch (error) {
      console.error("Erreur /operators GET :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération des opérateurs.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/operators/:id
   * =====================================================
   *  - Récupère un opérateur spécifique
   */
  app.get("/api/v1/operators/:id", async (req, res) => {
    try {
      const operator = await Operator.findByPk(req.params.id);
      if (!operator) {
        return res.status(404).json({
          success: false,
          message: "Opérateur non trouvé.",
        });
      }

      res.status(200).json({
        success: true,
        message: "Opérateur récupéré avec succès.",
        data: operator,
      });
    } catch (error) {
      console.error("Erreur /operators/:id :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la récupération de l’opérateur.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  PUT /api/v1/operators/:id
   * =====================================================
   *  - Met à jour un opérateur
   */
  app.put("/api/v1/operators/:id", auth, async (req, res) => {
    try {
      const operator = await Operator.findByPk(req.params.id);
      if (!operator) {
        return res.status(404).json({
          success: false,
          message: "Opérateur non trouvé.",
        });
      }

      await operator.update(req.body);

      res.status(200).json({
        success: true,
        message: "Opérateur mis à jour avec succès.",
        data: operator,
      });
    } catch (error) {
      console.error("Erreur PUT /operators :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la mise à jour de l’opérateur.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  PATCH /api/v1/operators/:id/toggle
   * =====================================================
   *  - Active / désactive un opérateur
   */
  app.patch("/api/v1/operators/:id/toggle", auth, async (req, res) => {
    try {
      const operator = await Operator.findByPk(req.params.id);
      if (!operator) {
        return res.status(404).json({
          success: false,
          message: "Opérateur non trouvé.",
        });
      }

      operator.active = !operator.active;
      await operator.save();

      res.status(200).json({
        success: true,
        message: `Opérateur ${
          operator.active ? "activé" : "désactivé"
        } avec succès.`,
        data: operator,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors du changement de statut.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  DELETE /api/v1/operators/:id
   * =====================================================
   *  - Supprime un opérateur
   */
  app.delete("/api/v1/operators/:id", auth, async (req, res) => {
    try {
      const operator = await Operator.findByPk(req.params.id);
      if (!operator) {
        return res.status(404).json({
          success: false,
          message: "Opérateur non trouvé.",
        });
      }

      await operator.destroy();
      res.status(200).json({
        success: true,
        message: "Opérateur supprimé avec succès.",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la suppression.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/operators/by-name/:name
   * =====================================================
   *  - Récupère un opérateur par son nom (ex: Orange Money)
   */
  app.get("/api/v1/operators/by-name/:name", auth, async (req, res) => {
    try {
      const name = req.params.name.trim();

      const operator = await Operator.findOne({
        where: { name },
      });

      if (!operator) {
        return res.status(404).json({
          success: false,
          message: `Aucun opérateur trouvé avec le nom "${name}".`,
        });
      }

      res.status(200).json({
        success: true,
        message: "Opérateur trouvé avec succès.",
        data: operator,
      });
    } catch (error) {
      console.error("Erreur /by-name :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la recherche par nom.",
        data: error.message,
      });
    }
  });

  /**
   * =====================================================
   *  GET /api/v1/operators/by-code/:short_code
   * =====================================================
   *  - Récupère un opérateur par son short_code (ex: ORANGE_MONEY)
   */
  app.get("/api/v1/operators/by-code/:short_code", auth, async (req, res) => {
    try {
      const short_code = req.params.short_code.trim().toUpperCase();

      const operator = await Operator.findOne({
        where: { short_code },
      });

      if (!operator) {
        return res.status(404).json({
          success: false,
          message: `Aucun opérateur trouvé avec le code "${short_code}".`,
        });
      }

      res.status(200).json({
        success: true,
        message: "Opérateur trouvé avec succès.",
        data: operator,
      });
    } catch (error) {
      console.error("Erreur /by-code :", error);
      res.status(500).json({
        success: false,
        message: "Erreur serveur lors de la recherche par code.",
        data: error.message,
      });
    }
  });
};
