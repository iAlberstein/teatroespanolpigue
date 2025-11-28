import { Router } from 'express';
import auth from './auth.js';
import users from './users.js';
import shows from './shows.js';
import sessions from './sessions.js';
import reservations from './reservations.js';
import payments from './payments.js';
import tickets from './tickets.js';
import share from './share.js';
import reports from './reports.js';
import bordereauxRouter from './bordereaux.js';
import discounts from './discounts.js';
import activityLogs from './activityLogs.js';
import notifications from './notifications.js';
import producers from './producers.js';
import cashRegister from './cashRegister.js';

const router = Router();

router.use('/auth', auth);
router.use('/users', users);
router.use('/shows', shows);
router.use('/sessions', sessions);
router.use('/reservations', reservations);
router.use('/payments', payments);
router.use('/tickets', tickets);
router.use('/share', share);
router.use('/reports', reports);
router.use('/bordereaux', bordereauxRouter);
router.use('/discounts', discounts);
router.use('/activity-logs', activityLogs);
router.use('/notifications', notifications);
router.use('/producers', producers);
router.use('/cash-register', cashRegister);

export default router;
