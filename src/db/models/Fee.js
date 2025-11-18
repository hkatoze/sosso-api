// models/fee.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const Fee = sequelize.define("Fee", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    from_operator_id: { type: DataTypes.UUID, allowNull: false },
    to_operator_id: { type: DataTypes.UUID, allowNull: false },
    min_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    },
    max_amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 999999999,
    },
    fee_fixed: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    fee_percent: { type: DataTypes.FLOAT, defaultValue: 0 },
    provider_id: { type: DataTypes.UUID, allowNull: true },
  });

  Fee.associate = (models) => {
    Fee.belongsTo(models.Operator, {
      as: "fromOperator",
      foreignKey: "from_operator_id",
    });
    Fee.belongsTo(models.Operator, {
      as: "toOperator",
      foreignKey: "to_operator_id",
    });
    Fee.belongsTo(models.ApiProvider, {
      as: "provider",
      foreignKey: "provider_id",
    });
  };

  return Fee;
};
