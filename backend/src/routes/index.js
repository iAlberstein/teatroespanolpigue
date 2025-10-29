import { Router } from 'express';
import users from './users.js';
import shows from './shows.js';
import sessions from './sessions.js';
import reservations from './reservations.js';

const router = Router();

router.use('/users', users);
router.use('/shows', shows);
router.use('/sessions', sessions);
router.use('/reservations', reservations);

export default router;
