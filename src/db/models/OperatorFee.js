"use strict";
module.exports = (sequelize, DataTypes) => {
  const OperatorFee = sequelize.define("OperatorFee", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    from_operator_id: { type: DataTypes.UUID, allowNull: false },
    to_operator_id: { type: DataTypes.UUID, allowNull: false },
    fee_fixed: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    fee_percent: { type: DataTypes.FLOAT, defaultValue: 0 },
  });

  OperatorFee.associate = (models) => {
    OperatorFee.belongsTo(models.Operator, { as: "fromOperator", foreignKey: "from_operator_id" });
    OperatorFee.belongsTo(models.Operator, { as: "toOperator", foreignKey: "to_operator_id" });
  };

  return OperatorFee;
};
