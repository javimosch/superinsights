const crypto = require('crypto');

function generateRandomHex() {
  return crypto.randomBytes(32).toString('hex');
}

function generatePublicKey() {
  return `pk_${generateRandomHex()}`;
}

function generateSecretKey() {
  return `sk_${generateRandomHex()}`;
}

function generateKeyPair() {
  return {
    publicKey: generatePublicKey(),
    secretKey: generateSecretKey(),
  };
}

module.exports = {
  generatePublicKey,
  generateSecretKey,
  generateKeyPair,
};
