function generateVerificationCode() {
    const min = 100000; // Valeur minimale (inclus)
    const max = 999999; // Valeur maximale (inclus)
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  module.exports = { generateVerificationCode };