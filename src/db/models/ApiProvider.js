// models/apiProvider.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const ApiProvider = sequelize.define("ApiProvider", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    base_url: { type: DataTypes.STRING, allowNull: true },
    api_key: { type: DataTypes.STRING, allowNull: true },
    fee_policy: { type: DataTypes.JSONB, allowNull: true }, // e.g. { "orange": 0.01 }
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  });

  ApiProvider.associate = (models) => {
    ApiProvider.hasMany(models.Transaction, {
      foreignKey: "provider_id",
      as: "transactions",
    });
  };

  return ApiProvider;
};
