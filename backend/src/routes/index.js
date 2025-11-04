import { Router } from 'express';
import auth from './auth.js';
import users from './users.js';
import shows from './shows.js';
import sessions from './sessions.js';
import reservations from './reservations.js';
import payments from './payments.js';
import tickets from './tickets.js';

const router = Router();

router.use('/auth', auth);
router.use('/users', users);
router.use('/shows', shows);
router.use('/sessions', sessions);
router.use('/reservations', reservations);
router.use('/payments', payments);
router.use('/tickets', tickets);

export default router;
