// models/otp.js
"use strict";
module.exports = (sequelize, DataTypes) => {
  const Otp = sequelize.define("Otp", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    phone: { type: DataTypes.STRING, allowNull: false },
    otp_hash: { type: DataTypes.STRING, allowNull: false }, // store hashed OTP
    purpose: {
      type: DataTypes.ENUM("signup", "transfer_confirm", "reset_pin"),
      allowNull: false,
    },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    expires_at: { type: DataTypes.DATE, allowNull: false },
  });

  Otp.associate = (/*models*/) => {
    // no direct associations
  };

  return Otp;
};
