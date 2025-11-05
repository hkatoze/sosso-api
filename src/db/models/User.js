"use strict";
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define("User", {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
      validate: {
        is: {
          args: [/^\+?[0-9]{8,15}$/], // format basique +226XXXXXX
          msg: "Numéro de téléphone invalide",
        },
      },
    },

    is_anonymous: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
    },

    verified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  });

  // Associations
  User.associate = (models) => {
    User.hasMany(models.Device, { foreignKey: "user_id", as: "devices" });
    User.hasMany(models.Transaction, {
      foreignKey: "user_id",
      as: "transactions",
    });
  };

  return User;
};
