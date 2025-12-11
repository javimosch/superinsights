const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { createRateLimiter } = require('../middleware/rateLimit');

const authLimiter = createRateLimiter({ windowMs: 60_000, max: 20 });

router.get('/register', authController.getRegister);
router.post('/register', authLimiter, authController.postRegister);

router.get('/login', authController.getLogin);
router.post('/login', authLimiter, authController.postLogin);

router.post('/logout', authController.postLogout);

module.exports = router;
