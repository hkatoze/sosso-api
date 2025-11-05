// models/idempotencyKey.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const IdempotencyKey = sequelize.define("IdempotencyKey", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    key: { type: DataTypes.STRING, unique: true, allowNull: false },
    transaction_id: { type: DataTypes.UUID, allowNull: true },
    created_by: { type: DataTypes.STRING, allowNull: true }, // device_uid or user_id
    expires_at: { type: DataTypes.DATE, allowNull: true },
  });

  IdempotencyKey.associate = (models) => {
    IdempotencyKey.belongsTo(models.Transaction, {
      foreignKey: "transaction_id",
      as: "transaction",
    });
  };

  return IdempotencyKey;
};
