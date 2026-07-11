import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, refresh, logout, googleOAuthInit, googleOAuthCallback, googleAuthLogin } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Validation chains
const registerValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name field is required')
    .isLength({ min: 2 })
    .withMessage('Name must be at least 2 characters long'),
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),
];

const loginValidator = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
];

// Mount endpoints
router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);

// Google Sign-In Init — Public endpoint to start Google OAuth flow
router.get('/google-login', googleAuthLogin);

// Google Calendar OAuth — init requires auth (to know which user to link)
// Callback is public (Google redirects here with code)
router.get('/google', authenticate, googleOAuthInit);
router.get('/google/callback', googleOAuthCallback);

export default router;
