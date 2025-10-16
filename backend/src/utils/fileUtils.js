import fs from 'fs';
import path from 'path';

export const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

export const cleanupFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`🗑️ Cleaned up: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.error(`⚠️ Cleanup failed: ${err.message}`);
  }
};
