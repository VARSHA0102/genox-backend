import { VercelRequest, VercelResponse } from '@vercel/node';
import { MemStorage } from '../utils/storage';

const storage = new MemStorage();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const existing = await storage.getNewsletterByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'Email already subscribed' });
    }

    await storage.insertNewsletter({ email });
    res.status(200).json({ message: 'Subscribed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to subscribe' });
  }
}