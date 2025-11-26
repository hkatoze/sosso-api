"use strict";
module.exports = (sequelize, DataTypes) => {
  const PlatformFee = sequelize.define("PlatformFee", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fee_fixed: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    fee_percent: { type: DataTypes.FLOAT, defaultValue: 0 },
  });

  return PlatformFee;
};
