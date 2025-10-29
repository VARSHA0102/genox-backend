import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();
// Email configuration
const createTransporter = (forceReal = false) => {
    // If we need real emails (like newsletters) or have email credentials, use real transporter
    if (forceReal || process.env.GMAIL_USER || process.env.SMTP_HOST) {
        // Option 1: Gmail
        if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
            return nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.GMAIL_USER,
                    pass: process.env.GMAIL_PASS, // Use App Password for Gmail
                },
            });
        }
        // Option 2: SMTP
        if (process.env.SMTP_HOST) {
            return nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
        }
        // Option 3: Use MailHog/test server or log mode for now
        console.log('⚠️  No email credentials configured. Emails will be logged to console.');
        return nodemailer.createTransport({
            streamTransport: true,
            newline: 'unix',
            buffer: true
        });
    }
    // For development contact forms, use test transporter
    return nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true
    });
};
export const sendContactEmail = async (contactData) => {
    const transporter = createTransporter();
    const mailOptions = {
        from: contactData.email,
        to: process.env.GMAIL_USER || "genorcasx@gmail.com",
        replyTo: contactData.email,
        subject: `New Contact Form Submission from ${contactData.name}`,
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9, #3b82f6); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">New Contact Form Submission</h1>
        </div>
        
        <div style="padding: 30px; background-color: #f8fafc;">
          <h2 style="color: #1e293b; margin-bottom: 20px;">Contact Details</h2>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <p style="margin: 10px 0;"><strong>Name:</strong> ${contactData.name}</p>
            <p style="margin: 10px 0;"><strong>Email:</strong> ${contactData.email}</p>
            ${contactData.company ? `<p style="margin: 10px 0;"><strong>Company:</strong> ${contactData.company}</p>` : ''}
          </div>
          
          <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h3 style="color: #1e293b; margin-top: 0;">Message:</h3>
            <p style="line-height: 1.6; color: #475569;">${contactData.message.replace(/\n/g, '<br>')}</p>
          </div>
        </div>
        
        <div style="background-color: #e2e8f0; padding: 20px; text-align: center; font-size: 14px; color: #64748b;">
          <p style="margin: 0;">This email was sent from the GenOrcasX contact form.</p>
        </div>
      </div>
    `,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        // In development mode, log the email content instead of sending
        if (process.env.NODE_ENV === 'development') {
            console.log('📧 [DEV] Contact Email Captured:');
            console.log(`To: ${mailOptions.to}`);
            console.log(`From: ${mailOptions.from}`);
            console.log(`Subject: ${mailOptions.subject}`);
            console.log(`Contact: ${contactData.name} (${contactData.email})`);
            console.log(`Company: ${contactData.company || 'N/A'}`);
            console.log(`Message: ${contactData.message}`);
            console.log('✅ Email captured successfully (development mode)');
        }
        else {
            console.log('Contact email sent:', info.messageId);
        }
        return { success: true, messageId: info.messageId || 'dev-mode' };
    }
    catch (error) {
        console.error('Failed to send contact email:', error);
        return { success: false, error: error.message || 'Email service error' };
    }
};
export const sendWelcomeEmail = async (email) => {
    const transporter = createTransporter(true); // Force real email for newsletters
    const mailOptions = {
        from: process.env.GMAIL_USER || "genorcasx@gmail.com",
        to: email,
        subject: 'Welcome to GenOrcasX Newsletter!',
        html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0ea5e9, #3b82f6); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">Welcome to GenOrcasX!</h1>
        </div>
        
        <div style="padding: 30px; background-color: #f8fafc;">
          <h2 style="color: #1e293b;">Thank you for subscribing!</h2>
          <p style="color: #475569; line-height: 1.6;">
            You're now part of our community and will receive updates about:
          </p>
          
          <ul style="color: #475569; line-height: 1.8;">
            <li>Latest AI tools and features</li>
            <li>Industry insights and best practices</li>
            <li>Product updates and announcements</li>
            <li>Exclusive content and early access</li>
          </ul>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://genorcasx.com/tools" style="background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Explore Our AI Tools
            </a>
          </div>
        </div>
        
        <div style="background-color: #e2e8f0; padding: 20px; text-align: center; font-size: 14px; color: #64748b;">
          <p style="margin: 0;">
            If you didn't sign up for this newsletter, you can 
            <a href="#" style="color: #0ea5e9;">unsubscribe here</a>.
          </p>
        </div>
      </div>
    `,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        // Log email sending
        if (process.env.GMAIL_USER && info.messageId !== 'dev-mode') {
            console.log('📧 Newsletter Welcome Email Sent:');
            console.log(`To: ${email}`);
            console.log(`From: ${mailOptions.from}`);
            console.log(`Subject: ${mailOptions.subject}`);
            console.log(`✅ Welcome email sent successfully! Message ID: ${info.messageId}`);
        }
        else {
            console.log('📧 [DEV] Newsletter Welcome Email Logged:');
            console.log(`To: ${email}`);
            console.log(`From: ${mailOptions.from}`);
            console.log(`Subject: ${mailOptions.subject}`);
            console.log('✅ Email captured in development mode (no real email sent)');
            console.log('💡 To send real emails, set up Gmail credentials in .env file');
        }
        return { success: true, messageId: info.messageId || 'dev-mode' };
    }
    catch (error) {
        console.error('Failed to send welcome email:', error);
        return { success: false, error: error.message || 'Email service error' };
    }
};
