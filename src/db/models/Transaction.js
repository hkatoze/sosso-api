"use strict";
module.exports = (sequelize, DataTypes) => {
  const Transaction = sequelize.define(
    "Transaction",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      reference: { type: DataTypes.STRING, unique: true, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: true },
      device_id: { type: DataTypes.UUID, allowNull: true },
      sender_operator_id: { type: DataTypes.UUID, allowNull: false },
      sender_phone: { type: DataTypes.STRING, allowNull: false },
      receiver_operator_id: { type: DataTypes.UUID, allowNull: false },
      receiver_phone: { type: DataTypes.STRING, allowNull: false },
      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      fees: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
      amount_received: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      provider_id: { type: DataTypes.UUID, allowNull: true },
      provider_reference: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "processing",
          "success",
          "failed",
          "refunded"
        ),
        defaultValue: "pending",
      },
      status_reason: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },

      // 🕒 Nouveau champ : date et heure de la transaction
      transaction_datetime: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
        comment: "Date et heure de la transaction effective",
      },
    },
    {
      // Active les timestamps Sequelize (si pas déjà fait)
      timestamps: true,
    }
  );

  Transaction.associate = (models) => {
    Transaction.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    Transaction.belongsTo(models.Device, {
      foreignKey: "device_id",
      as: "device",
    });
    Transaction.belongsTo(models.Operator, {
      as: "senderOperator",
      foreignKey: "sender_operator_id",
    });
    Transaction.belongsTo(models.Operator, {
      as: "receiverOperator",
      foreignKey: "receiver_operator_id",
    });
    Transaction.belongsTo(models.ApiProvider, {
      as: "provider",
      foreignKey: "provider_id",
    });
    Transaction.hasMany(models.TransactionEvent, {
      foreignKey: "transaction_id",
      as: "events",
    });
  };

  return Transaction;
};
