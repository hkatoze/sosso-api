function formatAmount(montant) {
  if (montant == null) return "0";
  return montant.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

module.exports = { formatAmount };