// models/device.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const Device = sequelize.define("Device", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    device_uid: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    os: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  });

  Device.associate = (models) => {
    Device.belongsTo(models.User, { foreignKey: "user_id", as: "user" });
    Device.hasMany(models.Transaction, {
      foreignKey: "device_id",
      as: "transactions",
    });
  };

  return Device;
};
