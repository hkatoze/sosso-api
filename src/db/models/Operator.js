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
    // Relations avec les transactions
    Operator.hasMany(models.Transaction, {
      foreignKey: "sender_operator_id",
      as: "sentTransactions",
    });
    Operator.hasMany(models.Transaction, {
      foreignKey: "receiver_operator_id",
      as: "receivedTransactions",
    });

    // Relations avec les nouveaux frais : OperatorFee
    Operator.hasMany(models.OperatorFee, {
      foreignKey: "from_operator_id",
      as: "operatorFeesFrom",
    });

    Operator.hasMany(models.OperatorFee, {
      foreignKey: "to_operator_id",
      as: "operatorFeesTo",
    });
  };

  return Operator;
};
