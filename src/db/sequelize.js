const path = require("path");
const fs = require("fs");
const { Sequelize, DataTypes } = require("sequelize");
require("dotenv").config();

// Configure Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: process.env.DB_DIALECT,
    port: process.env.DB_PORT,
    logging: process.env.NODE_ENV === "development" ? console.log : false,
    dialectOptions:
      process.env.DB_SSL && process.env.DB_SSL.toLowerCase() === "true"
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : {},
    define: {
      underscored: true,
      freezeTableName: false,
      timestamps: true,
    },
  }
);

// loader models from models/ folder
const models = {};
const modelsDir = path.join(__dirname, "models");

// read all .js model files (ignore index.js if present)
fs.readdirSync(modelsDir)
  .filter((file) => {
    return file.indexOf(".") !== 0 && file.slice(-3) === ".js";
  })
  .forEach((file) => {
    const modelPath = path.join(modelsDir, file);
    const modelImporter = require(modelPath);
    // each model file should export (sequelize, DataTypes) => model
    const model = modelImporter(sequelize, DataTypes);
    models[model.name] = model;
  });

// call associate if exists (after all models are defined)
Object.keys(models).forEach((modelName) => {
  if (typeof models[modelName].associate === "function") {
    models[modelName].associate(models);
  }
});

// convenience: attach sequelize & Sequelize on models object
models.sequelize = sequelize;
models.Sequelize = Sequelize;

/**
 * initDb(options)
 * - options.sync: boolean (default true in dev)
 * - options.alter: boolean -> uses sequelize.sync({ alter: true }) (useful dev only)
 * - options.force: boolean -> drops tables (dangerous)
 *
 * NOTE: For production, use proper migrations (sequelize-cli / umzug)
 * instead of sync().
 */
const initDb = async (opts = {}) => {
  const defaultOpts = { sync: true, alter: false, force: false };
  const { sync, alter, force } = Object.assign(defaultOpts, opts);

  try {
    // test connection first
    await sequelize.authenticate();
    console.log("✅ Database connection OK");

    if (sync) {
      console.log("🔁 Synchronizing models with database...");
      // WARNING: alter = true will change tables to match models (use carefully)
      await sequelize.sync({ alter, force });
      console.log("✅ Models synchronized");

      // --- INITIAL DATA SEEDING ---
const { PlatformFee, OperatorFee } = models;

// Seed PlatformFee if empty
const platformFeeCount = await PlatformFee.count();
if (platformFeeCount === 0) {
  await PlatformFee.create({
    fee_fixed: 50,     // TES TARIFS
    fee_percent: 1.2
  });

  console.log("🌱 PlatformFee inserted.");
}

// Seed OperatorFee if empty
const operatorFeeCount = await OperatorFee.count();
if (operatorFeeCount === 0) {
  // IDs de tes opérateurs
  const operators = [
    "021b76fb-2122-4f13-b116-ca3a84bc3cdf", // Moov Money
    "192b3ec4-3162-4b28-85ba-67e5a3f256f8", // Wave
    "37aa8ebc-61d7-4c37-bda1-8f18d1aad263", // Orange Money
    "d325b806-8942-4671-a5eb-28afabe17cfd", // Télécel Money
    "f529a5ff-ede4-414a-9f27-7d50c4537ea2", // Sank Money
  ];

  // Génération auto de toutes les combinaisons FROM → TO
  const fees = [];
  const OPERATOR_PERCENT = 4; // même taux pour tous

  for (const from of operators) {
    for (const to of operators) {
      if (from === to) continue; // on ignore opérateur -> lui même

      fees.push({
        from_operator_id: from,
        to_operator_id: to,
        fee_percent: OPERATOR_PERCENT,
        fee_fixed: 0
      });
    }
  }

  await OperatorFee.bulkCreate(fees);

  console.log("🌱 OperatorFees inserted (4% globally).");
}

console.log("🌱 Initial data seeding completed.");

    } else {
      console.log("ℹ️ sync skipped (use migrations in production)");
    }
  } catch (err) {
    console.error("❌ Unable to initialize DB:", err);
    throw err;
  }
};

module.exports = {
  initDb,
  sequelize,
  models,
};
