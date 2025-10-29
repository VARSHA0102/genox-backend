import { VercelRequest, VercelResponse } from '@vercel/node';
import multer from 'multer';
import { promises as fs } from 'fs';

const upload = multer({ dest: 'uploads/' });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  upload.single('file')(req as any, res as any, async (err) => {
    if (err) {
      return res.status(500).json({ error: 'File upload failed' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
      const filePath = `uploads/${file.filename}`;
      await fs.rename(file.path, filePath);
      res.status(200).json({ message: 'File uploaded successfully', path: filePath });
    } catch (error) {
      res.status(500).json({ error: 'Failed to save file' });
    }
  });
}