const jwt = require("jsonwebtoken");
require("dotenv").config();
module.exports = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  // Vérifie si le header Authorization est présent
  if (!authorizationHeader) {
    const message = `Vous n'avez pas fourni de jeton d'authentification. Ajoutez-en un dans l'en-tête de la requête.`;
    return res.status(401).json({ message });
  }

  const token = authorizationHeader.split(" ")[1];

  // Vérifie le token JWT
  jwt.verify(token, `${process.env.JWT_SECRET}`, (error, decodedToken) => {
    if (error) {
      const message = `L'utilisateur n'est pas autorisé à accéder à cette ressource.`;
      return res.status(401).json({ message, data: error });
    }

    // Ajoute l'ID utilisateur extrait du token à la requête pour utilisation ultérieure
    req.userId = decodedToken.userId;

    // Passe au prochain middleware
    next();
  });
};
