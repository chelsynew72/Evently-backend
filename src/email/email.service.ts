import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const gmailUser = this.configService.get<string>('gmail.user');
    const gmailAppPassword = this.configService.get<string>('gmail.appPassword');

    if (gmailUser && gmailAppPassword) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: gmailUser,
          pass: gmailAppPassword,
        },
      });
      this.logger.log('Gmail email transporter initialized successfully');
    } else {
      this.logger.warn('Gmail credentials not configured - emails will be logged to console only');
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<boolean> {
    const mailOptions = {
      from: `"Evently" <${this.configService.get<string>('gmail.user')}>`,
      to: email,
      subject: 'Your Evently Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Welcome to Evently!</h2>
          <p style="color: #666; text-align: center; font-size: 16px;">Your verification code is:</p>
          <div style="text-align: center; margin: 30px 0;">
            <span style="background-color: #f5f5f5; padding: 15px 30px; font-size: 32px; font-weight: bold; letter-spacing: 5px; border-radius: 8px; color: #2196F3;">${code}</span>
          </div>
          <p style="color: #999; text-align: center; font-size: 14px;">This code will expire in 5 minutes. Don't share it with anyone.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="color: #bbb; text-align: center; font-size: 12px;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `,
    };

    try {
      if (this.transporter) {
        await this.transporter.sendMail(mailOptions);
        this.logger.log(`Verification code sent to ${email}`);
        return true;
      } else {
        // Fallback to console logging if email is not configured
        this.logger.log(`[DEV ONLY] Email code for ${email}: ${code}`);
        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to send email to ${email}:`, error);
      // Still log the code for development even if email fails
      this.logger.log(`[FALLBACK] Email code for ${email}: ${code}`);
      return false;
    }
  }
}