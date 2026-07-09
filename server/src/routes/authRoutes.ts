import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, refresh, logout } from '../controllers/authController';
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

export default router;
