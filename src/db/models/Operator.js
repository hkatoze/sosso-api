// models/operator.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const Operator = sequelize.define("Operator", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
    short_code: { type: DataTypes.STRING, allowNull: false, unique: true },
    logo_url: { type: DataTypes.STRING, allowNull: false },
    country: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Burkina Faso",
    },
    active: { type: DataTypes.BOOLEAN, defaultValue: true },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  });

  Operator.associate = (models) => {
    Operator.hasMany(models.Transaction, {
      foreignKey: "sender_operator_id",
      as: "sentTransactions",
    });
    Operator.hasMany(models.Transaction, {
      foreignKey: "receiver_operator_id",
      as: "receivedTransactions",
    });
    Operator.hasMany(models.Fee, {
      foreignKey: "from_operator_id",
      as: "feesFrom",
    });
    Operator.hasMany(models.Fee, {
      foreignKey: "to_operator_id",
      as: "feesTo",
    });
  };

  return Operator;
};
