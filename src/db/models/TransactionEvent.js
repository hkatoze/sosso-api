// models/transactionEvent.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const TransactionEvent = sequelize.define("TransactionEvent", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    transaction_id: { type: DataTypes.UUID, allowNull: false },
    event_type: { type: DataTypes.STRING, allowNull: false },
    payload: { type: DataTypes.JSONB, allowNull: true },
  });

  TransactionEvent.associate = (models) => {
    TransactionEvent.belongsTo(models.Transaction, {
      foreignKey: "transaction_id",
      as: "transaction",
    });
  };

  return TransactionEvent;
};
