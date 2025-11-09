function generateVerificationCode() {
  const min = 10000; // Valeur minimale (inclus)
  const max = 99999; // Valeur maximale (inclus)
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
module.exports = { generateVerificationCode };
