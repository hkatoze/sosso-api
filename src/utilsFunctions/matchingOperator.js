function matchingOperator(operator) {
switch (operator) {
    case "MM":
        return "MOOV_BFA";

    case "OM":
        return "ORANGE_BFA";

    default:
        return "UNKNOW";
}
}

module.exports = { matchingOperator };