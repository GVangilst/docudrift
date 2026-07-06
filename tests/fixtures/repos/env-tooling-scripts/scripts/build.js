// Build helper — reads a secret from the environment at build time.
const secret = process.env.SECRET_X;
module.exports = { secret };
