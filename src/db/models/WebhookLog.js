// models/webhookLog.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const WebhookLog = sequelize.define("WebhookLog", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    provider_id: { type: DataTypes.UUID, allowNull: true },
    endpoint: { type: DataTypes.STRING, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: true },
    headers: { type: DataTypes.JSONB, allowNull: true },
    processed: { type: DataTypes.BOOLEAN, defaultValue: false },
    processing_result: { type: DataTypes.TEXT, allowNull: true },
    received_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  });

  WebhookLog.associate = (models) => {
    WebhookLog.belongsTo(models.ApiProvider, {
      foreignKey: "provider_id",
      as: "provider",
    });
  };

  return WebhookLog;
};
