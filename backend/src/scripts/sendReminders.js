import dotenv from 'dotenv';
import { sequelize, initSequelize } from '../lib/sequelize.js';
import { sendShowReminder } from '../lib/emailService.js';
import { formatDateLong, formatTime } from '../lib/dateFormatter.js';

dotenv.config();

/**
 * Send reminder emails to customers 24h before their show
 * Run this script daily with cron:
 * 0 10 * * * cd /path/to/backend && node src/scripts/sendReminders.js
 */
async function sendReminders() {
  try {
    console.log('🔔 Starting reminder email job...');
    
    await initSequelize();
    
    const { sessions: Session, shows: Show, sales: Sale, users: User, tickets: Ticket } = sequelize.models;
    
    // Get sessions that start between 23-25 hours from now
    const now = new Date();
    const start24h = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const end24h = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    
    console.log(`📅 Looking for sessions between ${start24h.toISOString()} and ${end24h.toISOString()}`);
    
    const sessions = await Session.findAll({
      where: {
        starts_at: {
          [sequelize.Sequelize.Op.gte]: start24h,
          [sequelize.Sequelize.Op.lte]: end24h
        }
      },
      include: [
        {
          model: Show,
          as: 'show',
          attributes: ['id', 'title']
        },
        {
          model: Sale,
          as: 'sales',
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['id', 'name', 'email']
            },
            {
              model: Ticket,
              as: 'tickets',
              attributes: ['id']
            }
          ]
        }
      ]
    });
    
    console.log(`📨 Found ${sessions.length} sessions to send reminders for`);
    
    let emailsSent = 0;
    let emailsFailed = 0;
    const processedEmails = new Set(); // Avoid sending duplicates
    
    for (const session of sessions) {
      console.log(`\n📍 Processing session: ${session.show.title} at ${session.starts_at}`);
      
      for (const sale of session.sales) {
        // Skip if no user or user has no email
        if (!sale.user || !sale.user.email) {
          // Check if customer_email exists in sale
          if (!sale.customer_email) {
            console.log(`  ⏭️  Skipping sale ${sale.id} - no email available`);
            continue;
          }
        }
        
        const customerEmail = sale.user?.email || sale.customer_email;
        const customerName = sale.user?.name || sale.customer_name || 'Cliente';
        
        // Avoid sending duplicate emails to same customer for same session
        const emailKey = `${customerEmail}-${session.id}`;
        if (processedEmails.has(emailKey)) {
          console.log(`  ⏭️  Already sent reminder to ${customerEmail}`);
          continue;
        }
        
        const ticketsCount = sale.tickets?.length || 0;
        if (ticketsCount === 0) {
          console.log(`  ⏭️  Skipping sale ${sale.id} - no tickets`);
          continue;
        }
        
        try {
          const result = await sendShowReminder({
            customerEmail,
            customerName,
            showTitle: session.show.title,
            sessionDate: formatDateLong(session.starts_at),
            sessionTime: formatTime(session.starts_at),
            ticketsCount,
            saleId: sale.id
          });
          
          if (result.success) {
            console.log(`  ✅ Reminder sent to ${customerEmail}`);
            emailsSent++;
            processedEmails.add(emailKey);
          } else if (result.logged) {
            console.log(`  📝 Reminder logged (SMTP not configured) for ${customerEmail}`);
          } else {
            console.log(`  ❌ Failed to send reminder to ${customerEmail}:`, result.error);
            emailsFailed++;
          }
        } catch (error) {
          console.error(`  ❌ Error sending reminder to ${customerEmail}:`, error);
          emailsFailed++;
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 Summary:');
    console.log(`   Sessions processed: ${sessions.length}`);
    console.log(`   Emails sent: ${emailsSent}`);
    console.log(`   Emails failed: ${emailsFailed}`);
    console.log('='.repeat(60));
    
    await sequelize.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error in reminder job:', error);
    process.exit(1);
  }
}

sendReminders();
