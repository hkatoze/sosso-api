module.exports = (Sequelize, DataTypes) => {
  return Sequelize.define(
    "Admin",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      emailAddress: {
        type: DataTypes.STRING,

        unique: {
          msg: "L'adresse mail est déjà utilisée.",
        },
        validate: {
          isEmail: {
            msg: "L'adresse mail n'est pas valide",
          },
        },
      },

      password: {
        type: DataTypes.STRING,
      },
      fcmToken: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      resetPasswordCode: {
        type: DataTypes.STRING,
        allowNull: true,
      },
    },
    { timestamp: true }
  );
};
